-- supabase_dev_policies.sql
-- DEV ONLY: Enable RLS, create permissive dev policies, and provision the tournament schema.
-- WARNING: These policies grant broad access to the anonymous role. Remove or tighten them for production.

-- ---------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) SCHEMA : Create tables if they do not exist
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'draft',
  code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time timestamptz,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  full_name text,
  fftt_points integer DEFAULT 0,
  points integer DEFAULT 0,
  email text,
  payment_status text DEFAULT 'unpaid',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  label text,
  status text DEFAULT 'free',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.category_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  status text DEFAULT 'in_poules',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  poule_id uuid,
  next_match_id uuid REFERENCES public.matches(id),
  table_id uuid REFERENCES public.tables(id),
  player1_id uuid REFERENCES public.players(id),
  player2_id uuid REFERENCES public.players(id),
  winner_id uuid REFERENCES public.players(id),
  score1 integer,
  score2 integer,
  status text DEFAULT 'scheduled',
  round_type text,
  poule_order integer,
  is_bye boolean DEFAULT false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2) SCHEMA MIGRATIONS : add missing columns and indexes
-- ---------------------------------------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS round_type text
    CHECK (round_type IN ('poule','round_64','round_32','round_16','quarter','semi','final')),
  ADD COLUMN IF NOT EXISTS poule_id uuid,
  ADD COLUMN IF NOT EXISTS next_match_id uuid REFERENCES public.matches(id),
  ADD COLUMN IF NOT EXISTS poule_order integer,
  ADD COLUMN IF NOT EXISTS is_bye boolean DEFAULT false;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

ALTER TABLE public.category_players
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('in_poules','in_bracket','playing','eliminated','winner'))
    DEFAULT 'in_poules';

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS points integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_matches_playing_p1
  ON public.matches (player1_id) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS idx_matches_playing_p2
  ON public.matches (player2_id) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS idx_matches_poule ON public.matches (poule_id);
CREATE INDEX IF NOT EXISTS idx_matches_next ON public.matches (next_match_id);

-- ---------------------------------------------------------------------
-- 3) RPC : assign_poule_to_table
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_poule_to_table(
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
  PERFORM 1 FROM public.tables WHERE id = p_table_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.tables WHERE id = p_table_id AND status <> 'free') THEN
    RAISE EXCEPTION 'La table % n''est pas libre', p_table_id;
  END IF;

  SELECT array_agg(DISTINCT pid) INTO v_player_ids
  FROM (
    SELECT player1_id AS pid FROM public.matches WHERE poule_id = p_poule_id
    UNION
    SELECT player2_id AS pid FROM public.matches WHERE poule_id = p_poule_id
  ) sub;

  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE status = 'playing'
      AND (player1_id = ANY(v_player_ids) OR player2_id = ANY(v_player_ids))
  ) THEN
    RAISE EXCEPTION 'Un joueur de la poule % est déjà en train de jouer ailleurs', p_poule_id;
  END IF;

  UPDATE public.tables SET status = 'busy' WHERE id = p_table_id;

  UPDATE public.matches
  SET table_id = p_table_id
  WHERE poule_id = p_poule_id;

  SELECT id INTO v_first_match_id
  FROM public.matches
  WHERE poule_id = p_poule_id
  ORDER BY poule_order ASC
  LIMIT 1;

  UPDATE public.matches SET status = 'playing' WHERE id = v_first_match_id;

  UPDATE public.category_players
  SET status = 'playing'
  WHERE player_id = ANY(v_player_ids);

  RETURN jsonb_build_object('table_id', p_table_id, 'first_match_id', v_first_match_id, 'players', v_player_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- 4) RPC : complete_poule_match
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_poule_match(
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
BEGIN
  SELECT poule_id, table_id INTO v_poule_id, v_table_id
  FROM public.matches WHERE id = p_match_id;

  UPDATE public.matches
  SET status = 'completed',
      score1 = p_score1,
      score2 = p_score2,
      winner_id = p_winner_id
  WHERE id = p_match_id;

  SELECT count(*) INTO v_total_matches FROM public.matches WHERE poule_id = v_poule_id;
  SELECT count(*) INTO v_finished_matches FROM public.matches WHERE poule_id = v_poule_id AND status = 'completed';

  IF v_finished_matches < v_total_matches THEN
    SELECT id INTO v_next_match_id
    FROM public.matches
    WHERE poule_id = v_poule_id AND status <> 'completed'
    ORDER BY poule_order ASC
    LIMIT 1;

    UPDATE public.matches SET status = 'playing', table_id = v_table_id WHERE id = v_next_match_id;

    RETURN jsonb_build_object('poule_finished', false, 'next_match_id', v_next_match_id);
  ELSE
    UPDATE public.tables SET status = 'free' WHERE id = v_table_id;

    UPDATE public.category_players
    SET status = 'in_poules'
    WHERE player_id IN (
      SELECT player1_id FROM public.matches WHERE poule_id = v_poule_id
      UNION
      SELECT player2_id FROM public.matches WHERE poule_id = v_poule_id
    );

    RETURN jsonb_build_object('poule_finished', true, 'table_id', v_table_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC : advance_bracket_winner
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_bracket_winner(
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
  FROM public.matches WHERE id = p_match_id;

  UPDATE public.matches
  SET status = 'completed', score1 = p_score1, score2 = p_score2, winner_id = p_winner_id
  WHERE id = p_match_id;

  IF v_table_id IS NOT NULL THEN
    UPDATE public.tables SET status = 'free' WHERE id = v_table_id;
  END IF;

  UPDATE public.category_players SET status = 'eliminated' WHERE player_id = p_loser_id;

  IF v_next_match_id IS NOT NULL THEN
    UPDATE public.matches
    SET player1_id = COALESCE(player1_id, p_winner_id)
    WHERE id = v_next_match_id AND player1_id IS NULL;

    UPDATE public.matches
    SET player2_id = COALESCE(player2_id, p_winner_id)
    WHERE id = v_next_match_id AND player2_id IS NULL
      AND player1_id IS DISTINCT FROM p_winner_id;

    UPDATE public.category_players SET status = 'in_bracket' WHERE player_id = p_winner_id;
  ELSE
    UPDATE public.category_players SET status = 'winner' WHERE player_id = p_winner_id;
  END IF;

  RETURN jsonb_build_object('next_match_id', v_next_match_id);
END;
$$;

-- ---------------------------------------------------------------------
-- 6) DEV POLICIES
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.category_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_anon_select_tournaments ON public.tournaments;
DROP POLICY IF EXISTS allow_anon_insert_tournaments ON public.tournaments;
DROP POLICY IF EXISTS allow_anon_select_categories ON public.categories;
DROP POLICY IF EXISTS allow_anon_insert_categories ON public.categories;
DROP POLICY IF EXISTS allow_anon_select_players ON public.players;
DROP POLICY IF EXISTS allow_anon_insert_players ON public.players;
DROP POLICY IF EXISTS allow_anon_select_matches ON public.matches;
DROP POLICY IF EXISTS allow_anon_insert_matches ON public.matches;
DROP POLICY IF EXISTS allow_anon_select_tables ON public.tables;
DROP POLICY IF EXISTS allow_anon_insert_tables ON public.tables;
DROP POLICY IF EXISTS allow_anon_select_category_players ON public.category_players;
DROP POLICY IF EXISTS allow_anon_insert_category_players ON public.category_players;
DROP POLICY IF EXISTS allow_anon_update_matches ON public.matches;
DROP POLICY IF EXISTS allow_anon_update_tables ON public.tables;

CREATE POLICY allow_anon_select_tournaments ON public.tournaments FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_tournaments ON public.tournaments FOR INSERT WITH CHECK (true);

CREATE POLICY allow_anon_select_categories ON public.categories FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_categories ON public.categories FOR INSERT WITH CHECK (true);

CREATE POLICY allow_anon_select_players ON public.players FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_players ON public.players FOR INSERT WITH CHECK (true);

CREATE POLICY allow_anon_select_matches ON public.matches FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_matches ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY allow_anon_update_matches ON public.matches FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY allow_anon_select_tables ON public.tables FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_tables ON public.tables FOR INSERT WITH CHECK (true);
CREATE POLICY allow_anon_update_tables ON public.tables FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY allow_anon_select_category_players ON public.category_players FOR SELECT USING (true);
CREATE POLICY allow_anon_insert_category_players ON public.category_players FOR INSERT WITH CHECK (true);

-- End of file
