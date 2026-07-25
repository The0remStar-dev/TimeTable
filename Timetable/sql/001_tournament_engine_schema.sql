-- =====================================================================
-- MIGRATION : Tournament Engine — schéma + fonctions transactionnelles
-- =====================================================================
-- IMPORTANT : le client Supabase JS ne fait PAS de vraies transactions
-- multi-tables (chaque .update()/.insert() est un appel HTTP séparé).
-- Pour éviter toute corruption (ex: une table marquée "busy" mais un
-- des 3 matchs de la poule qui échoue à se créer), les opérations
-- critiques ci-dessous sont implémentées en fonctions Postgres
-- (SECURITY DEFINER + transaction implicite du corps de fonction),
-- appelées depuis le JS via supabase.rpc(...).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOUVEAUX CHAMPS
-- ---------------------------------------------------------------------

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS round_type text
    CHECK (round_type IN ('poule','round_64','round_32','round_16','quarter','semi','final')),
  ADD COLUMN IF NOT EXISTS poule_id uuid,
  ADD COLUMN IF NOT EXISTS next_match_id uuid REFERENCES matches(id),
  ADD COLUMN IF NOT EXISTS poule_order integer, -- ordre de passage du match DANS la poule (1,2,3)
  ADD COLUMN IF NOT EXISTS is_bye boolean DEFAULT false; -- match "fictif" généré par une exemption

-- Statut du joueur DANS un tableau (categorie) donné.
-- 'playing' est ajouté par rapport à l'énoncé initial car la Phase 2
-- l'exige explicitement (un joueur en train de jouer doit être
-- détectable par l'anti-collision au niveau joueur, en plus du niveau match).
ALTER TABLE category_players
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('in_poules','in_bracket','playing','eliminated','winner'))
    DEFAULT 'in_poules';

-- Index critique : c'est LA requête de l'anti-collision (Phase 4),
-- elle doit être quasi instantanée même avec des milliers de matchs.
CREATE INDEX IF NOT EXISTS idx_matches_playing_p1
  ON matches (player1_id) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS idx_matches_playing_p2
  ON matches (player2_id) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS idx_matches_poule ON matches (poule_id);
CREATE INDEX IF NOT EXISTS idx_matches_next ON matches (next_match_id);

-- ---------------------------------------------------------------------
-- 2. RPC : assign_poule_to_table
-- Assigne UNE POULE ENTIÈRE à une table (règle "1 table = 1 poule").
-- Fait passer la table en 'busy', démarre le 1er match de la poule,
-- et passe les 3 joueurs en 'playing'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_poule_to_table(
  p_poule_id uuid,
  p_table_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_match_id uuid;
  v_player_ids uuid[];
BEGIN
  -- Verrou pessimiste sur la table pour empêcher une double-assignation
  -- si deux juges-arbitres cliquent en même temps.
  PERFORM 1 FROM tables WHERE id = p_table_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND status <> 'free') THEN
    RAISE EXCEPTION 'La table % n''est pas libre', p_table_id;
  END IF;

  -- Sécurité anti-collision au niveau poule : si un des joueurs de la
  -- poule est déjà "playing" ailleurs (autre tableau), on refuse.
  SELECT array_agg(DISTINCT pid) INTO v_player_ids
  FROM (
    SELECT player1_id AS pid FROM matches WHERE poule_id = p_poule_id
    UNION
    SELECT player2_id AS pid FROM matches WHERE poule_id = p_poule_id
  ) sub;

  IF EXISTS (
    SELECT 1 FROM matches
    WHERE status = 'playing'
      AND (player1_id = ANY(v_player_ids) OR player2_id = ANY(v_player_ids))
  ) THEN
    RAISE EXCEPTION 'Un joueur de la poule % est déjà en train de jouer ailleurs', p_poule_id;
  END IF;

  UPDATE tables SET status = 'busy' WHERE id = p_table_id;

  UPDATE matches
  SET table_id = p_table_id
  WHERE poule_id = p_poule_id;

  SELECT id INTO v_first_match_id
  FROM matches
  WHERE poule_id = p_poule_id
  ORDER BY poule_order ASC
  LIMIT 1;

  UPDATE matches SET status = 'playing' WHERE id = v_first_match_id;

  UPDATE category_players
  SET status = 'playing'
  WHERE player_id = ANY(v_player_ids);

  RETURN jsonb_build_object('table_id', p_table_id, 'first_match_id', v_first_match_id, 'players', v_player_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. RPC : complete_poule_match
-- Enregistre le score d'un match de poule. Si c'était le dernier des
-- 3 (ou 1 pour une poule de 2) matchs de la poule, libère la table et
-- calcule le classement (1er/2e/dernier) -> statuts joueurs mis à jour.
-- Sinon, démarre automatiquement le match suivant DE LA MÊME POULE
-- sur la même table (enchaînement sans repasser par la file d'attente).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_poule_match(
  p_match_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_winner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_poule_id uuid;
  v_table_id uuid;
  v_total_matches integer;
  v_finished_matches integer;
  v_next_match_id uuid;
  v_last_player uuid;
BEGIN
  SELECT poule_id, table_id INTO v_poule_id, v_table_id
  FROM matches WHERE id = p_match_id;

  UPDATE matches
  SET status = 'completed',
      score1 = p_score1,
      score2 = p_score2,
      winner_id = p_winner_id
  WHERE id = p_match_id;

  SELECT count(*) INTO v_total_matches FROM matches WHERE poule_id = v_poule_id;
  SELECT count(*) INTO v_finished_matches FROM matches WHERE poule_id = v_poule_id AND status = 'completed';

  IF v_finished_matches < v_total_matches THEN
    -- Enchaîne le match suivant de la poule sur la même table
    SELECT id INTO v_next_match_id
    FROM matches
    WHERE poule_id = v_poule_id AND status <> 'completed'
    ORDER BY poule_order ASC
    LIMIT 1;

    UPDATE matches SET status = 'playing', table_id = v_table_id WHERE id = v_next_match_id;

    RETURN jsonb_build_object('poule_finished', false, 'next_match_id', v_next_match_id);
  ELSE
    -- Poule terminée : on libère la table
    UPDATE tables SET status = 'free' WHERE id = v_table_id;

    -- Les joueurs qui ne sont pas encore "eliminated"/"winner" reviennent
    -- en 'in_poules' (en attente du calcul global du classement, fait
    -- côté JS dans generateBracket() une fois TOUTES les poules finies).
    UPDATE category_players
    SET status = 'in_poules'
    WHERE player_id IN (
      SELECT player1_id FROM matches WHERE poule_id = v_poule_id
      UNION
      SELECT player2_id FROM matches WHERE poule_id = v_poule_id
    );

    RETURN jsonb_build_object('poule_finished', true, 'table_id', v_table_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC : advance_bracket_winner
-- Fait avancer un gagnant de l'arbre final dans le match suivant
-- (via next_match_id), en le plaçant dans le premier slot libre
-- (player1_id ou player2_id). Libère la table du match joué.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION advance_bracket_winner(
  p_match_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_winner_id uuid,
  p_loser_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id uuid;
  v_next_match_id uuid;
BEGIN
  SELECT table_id, next_match_id INTO v_table_id, v_next_match_id
  FROM matches WHERE id = p_match_id;

  UPDATE matches
  SET status = 'completed', score1 = p_score1, score2 = p_score2, winner_id = p_winner_id
  WHERE id = p_match_id;

  IF v_table_id IS NOT NULL THEN
    UPDATE tables SET status = 'free' WHERE id = v_table_id;
  END IF;

  UPDATE category_players SET status = 'eliminated' WHERE player_id = p_loser_id;

  IF v_next_match_id IS NOT NULL THEN
    UPDATE matches
    SET player1_id = COALESCE(player1_id, p_winner_id)
    WHERE id = v_next_match_id AND player1_id IS NULL;

    UPDATE matches
    SET player2_id = COALESCE(player2_id, p_winner_id)
    WHERE id = v_next_match_id AND player2_id IS NULL
      AND player1_id IS DISTINCT FROM p_winner_id;

    UPDATE category_players SET status = 'in_bracket' WHERE player_id = p_winner_id;
  ELSE
    -- Pas de next_match_id => c'était la finale
    UPDATE category_players SET status = 'winner' WHERE player_id = p_winner_id;
  END IF;

  RETURN jsonb_build_object('next_match_id', v_next_match_id);
END;
$$;
