/**
 * tournamentEngine.js
 * ---------------------------------------------------------------------
 * Cœur algorithmique du tournoi de tennis de table.
 * Gère : génération des poules, règle "1 table = 1 poule",
 * génération de l'arbre final (knockout) avec byes, et l'ordonnanceur
 * anti-collision de la file d'attente.
 *
 * Prérequis : migration SQL 001_tournament_engine_schema.sql appliquée
 * (nouveaux champs + fonctions RPC transactionnelles).
 * ---------------------------------------------------------------------
 */

import { supabase } from '../lib/supabaseClient';

// =======================================================================
// UTILITAIRES GÉNÉRAUX
// =======================================================================

/** Plus petite puissance de 2 >= n (taille de l'arbre final). */
function nextPowerOfTwo(n) {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Ordre de seeding standard d'un tableau à élimination directe
 * (garantit que le 1er seed ne rencontre le 2e seed qu'en finale, etc.)
 * Retourne un tableau de positions (0-indexées) de taille size.
 * Ex pour size=8 : [0,7,4,3,2,5,6,1] (positions des seeds 1..8)
 */
function standardSeedPositions(size) {
  let positions = [0];
  let currentSize = 1;
  while (currentSize < size) {
    const next = [];
    for (const p of positions) {
      next.push(p);
      next.push(currentSize * 2 - 1 - p);
    }
    positions = next;
    currentSize *= 2;
  }
  return positions;
}

// =======================================================================
// PHASE 1 : GÉNÉRATION DES POULES
// =======================================================================

/**
 * Calcule la répartition en poules de 3 en priorité, avec des poules
 * de 2 uniquement pour "absorber" le reste (jamais de poule de 1,
 * jamais de poule de 4+ tant qu'une répartition en 3/2 est possible).
 *
 * Règle classique (FFTT) :
 *   n % 3 === 0  -> n/3 poules de 3
 *   n % 3 === 1  -> (n-4)/3 poules de 3 + 2 poules de 2
 *   n % 3 === 2  -> (n-2)/3 poules de 3 + 1 poule de 2
 *
 * @param {number} n nombre de joueurs
 * @returns {number[]} tailles des poules, ex: [3,3,3,2]
 */
export function computePouleSizes(n) {
  if (n <= 0) return [];
  if (n === 1) return [1]; // cas dégénéré : le joueur sera qualifié d'office
  if (n === 2) return [2];
  if (n === 3) return [3];
  if (n === 4) return [2, 2]; // évite la poule de 4

  const remainder = n % 3;
  if (remainder === 0) {
    return Array(n / 3).fill(3);
  }
  if (remainder === 1) {
    const nbPoulesDe3 = (n - 4) / 3;
    return [...Array(nbPoulesDe3).fill(3), 2, 2];
  }
  // remainder === 2
  const nbPoulesDe3 = (n - 2) / 3;
  return [...Array(nbPoulesDe3).fill(3), 2];
}

/**
 * Répartit les joueurs (déjà triés par points FFTT décroissants) dans
 * les poules en "serpentin" : Poule1, Poule2, ..., PouleK, PouleK, ...,
 * Poule2, Poule1, Poule1, ... pour équilibrer le niveau.
 * Gère les tailles de poules hétérogènes (3 et 2 mélangées).
 */
export function distributeSerpentine(sortedPlayers, pouleSizes) {
  const k = pouleSizes.length;
  const poules = pouleSizes.map(() => []);
  let round = 0;
  let idx = 0;

  while (idx < sortedPlayers.length) {
    const order = round % 2 === 0 ? range(k) : range(k).reverse();
    for (const pIdx of order) {
      if (idx >= sortedPlayers.length) break;
      if (poules[pIdx].length < pouleSizes[pIdx]) {
        poules[pIdx].push(sortedPlayers[idx]);
        idx += 1;
      }
    }
    round += 1;
    // Garde-fou anti-boucle infinie si toutes les poules cibles sont pleines
    // mais qu'il reste des joueurs (ne devrait pas arriver si pouleSizes
    // couvre bien sortedPlayers.length).
    if (round > sortedPlayers.length + k) break;
  }
  return poules;
}

/**
 * Génère les matchs d'une poule.
 * - Poule de 3 (A,B,C classés par points au sein de la poule) :
 *   ordre imposé par le cahier des charges -> A vs C, B vs C, A vs B
 * - Poule de 2 (A,B) : A vs B
 */
function buildPouleMatchesPayload(categoryId, pouleId, players) {
  const matches = [];

  if (players.length === 3) {
    const [A, B, C] = players;
    const order = [
      [A, C],
      [B, C],
      [A, B],
    ];
    order.forEach(([p1, p2], i) => {
      matches.push({
        category_id: categoryId,
        poule_id: pouleId,
        round_type: 'poule',
        poule_order: i + 1,
        player1_id: p1.id,
        player2_id: p2.id,
        status: 'scheduled',
      });
    });
  } else if (players.length === 2) {
    const [A, B] = players;
    matches.push({
      category_id: categoryId,
      poule_id: pouleId,
      round_type: 'poule',
      poule_order: 1,
      player1_id: A.id,
      player2_id: B.id,
      status: 'scheduled',
    });
  }
  // Poule de 1 (joueur seul) : pas de match, qualifié directement.
  // Traité en amont dans generatePoules() en le marquant 'in_bracket'.

  return matches;
}

/**
 * Fonction principale de la Phase 1.
 * @param {string} categoryId
 * @param {Array<{id:string, fftt_points:number}>} playersList
 */
export async function generatePoules(categoryId, playersList) {
  if (!playersList || playersList.length === 0) {
    throw new Error('Liste de joueurs vide pour generatePoules');
  }

  // 1) Tri par points FFTT décroissants (meilleur joueur en premier)
  const sorted = [...playersList].sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));

  // 2) Calcul des tailles de poules
  const pouleSizes = computePouleSizes(sorted.length);

  // 3) Placement en serpentin
  const poules = distributeSerpentine(sorted, pouleSizes);

  // 4) Création des poules + matchs en base
  const createdPoules = [];
  const allMatchesPayload = [];
  const soloQualifiers = []; // joueurs seuls dans une "poule de 1"

  for (const players of poules) {
    if (players.length === 1) {
      soloQualifiers.push(players[0]);
      continue;
    }
    // Un identifiant de poule est généré côté DB (uuid) ; on en génère un
    // logique ici pour lier les matchs, la table `matches.poule_id` est un uuid
    // libre (pas de table `poules` dédiée dans le cahier des charges).
    const pouleId = crypto.randomUUID();
    createdPoules.push({ pouleId, players });
    allMatchesPayload.push(...buildPouleMatchesPayload(categoryId, pouleId, players));
  }

  if (allMatchesPayload.length > 0) {
    const { error: matchError } = await supabase.from('matches').insert(allMatchesPayload);
    if (matchError) throw new Error(`Erreur création matchs de poules : ${matchError.message}`);
  }

  // Les joueurs sans adversaire (poule de 1) passent directement en 'in_bracket'
  if (soloQualifiers.length > 0) {
    const { error: soloError } = await supabase
      .from('category_players')
      .update({ status: 'in_bracket' })
      .eq('category_id', categoryId)
      .in('player_id', soloQualifiers.map((p) => p.id));
    if (soloError) throw new Error(`Erreur qualification directe : ${soloError.message}`);
  }

  // Tous les autres joueurs sont marqués 'in_poules'
  const enPoule = poules.flat().filter((p) => !soloQualifiers.includes(p));
  if (enPoule.length > 0) {
    const { error: statusError } = await supabase
      .from('category_players')
      .update({ status: 'in_poules' })
      .eq('category_id', categoryId)
      .in('player_id', enPoule.map((p) => p.id));
    if (statusError) throw new Error(`Erreur statut in_poules : ${statusError.message}`);
  }

  return {
    poules: createdPoules,
    soloQualifiers,
    pouleSizes,
  };
}

// =======================================================================
// PHASE 2 : ASSIGNATION "1 TABLE = 1 POULE"
// =======================================================================

/**
 * Assigne une poule entière à une table libre. Passe la table en 'busy',
 * démarre le premier match de la poule, et marque les 3 (ou 2) joueurs
 * comme 'playing'. Opération atomique via RPC Postgres.
 */
export async function assignPouleToTable(pouleId, tableId) {
  const { data, error } = await supabase.rpc('assign_poule_to_table', {
    p_poule_id: pouleId,
    p_table_id: tableId,
  });
  if (error) throw new Error(`Impossible d'assigner la poule à la table : ${error.message}`);
  return data;
}

/**
 * Enregistre le résultat d'un match de poule. Si c'est le dernier match
 * de la poule, libère automatiquement la table. Sinon, enchaîne le
 * match suivant DE LA MÊME POULE sur la même table (pas de repassage
 * par la file d'attente générale).
 */
export async function submitPouleMatchResult(matchId, score1, score2, winnerId) {
  const { data, error } = await supabase.rpc('complete_poule_match', {
    p_match_id: matchId,
    p_score1: score1,
    p_score2: score2,
    p_winner_id: winnerId,
  });
  if (error) throw new Error(`Erreur en enregistrant le résultat de poule : ${error.message}`);
  return data; // { poule_finished: bool, next_match_id? , table_id? }
}

// =======================================================================
// PHASE 3 : GÉNÉRATION DE L'ARBRE FINAL (KNOCKOUT)
// =======================================================================

const ROUND_TYPES_BY_SIZE = {
  64: 'round_64',
  32: 'round_32',
  16: 'round_16',
  8: 'quarter',
  4: 'semi',
  2: 'final',
};

/** Calcule le classement d'une poule à partir de ses matchs terminés. */
function rankPoulePlayers(pouleMatches, players) {
  const stats = {};
  players.forEach((p) => {
    stats[p.id] = { player: p, wins: 0, pointsFor: 0, pointsAgainst: 0 };
  });

  pouleMatches.forEach((m) => {
    if (m.winner_id) stats[m.winner_id].wins += 1;
    if (stats[m.player1_id]) {
      stats[m.player1_id].pointsFor += m.score1 ?? 0;
      stats[m.player1_id].pointsAgainst += m.score2 ?? 0;
    }
    if (stats[m.player2_id]) {
      stats[m.player2_id].pointsFor += m.score2 ?? 0;
      stats[m.player2_id].pointsAgainst += m.score1 ?? 0;
    }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    return diffB - diffA;
  });
}

/**
 * Génère l'arbre final d'une catégorie une fois toutes les poules
 * terminées.
 * - Élimine le(s) dernier(s) de chaque poule.
 * - Qualifie les 1ers (et 2èmes si l'arbre le permet).
 * - Calcule la taille d'arbre adaptée (puissance de 2 supérieure).
 * - Distribue des byes aux mieux classés si l'arbre est incomplet.
 * - Chaîne les matchs via next_match_id.
 */
export async function generateBracket(categoryId) {
  // 1) Récupérer toutes les poules terminées de la catégorie
  const { data: pouleMatches, error: pmError } = await supabase
    .from('matches')
    .select('*')
    .eq('category_id', categoryId)
    .eq('round_type', 'poule');
  if (pmError) throw new Error(`Erreur lecture matchs de poules : ${pmError.message}`);

  const unfinished = pouleMatches.filter((m) => m.status !== 'completed');
  if (unfinished.length > 0) {
    throw new Error('Toutes les poules ne sont pas terminées, impossible de générer l\'arbre.');
  }

  // Regrouper par poule_id
  const byPoule = {};
  pouleMatches.forEach((m) => {
    byPoule[m.poule_id] = byPoule[m.poule_id] || [];
    byPoule[m.poule_id].push(m);
  });

  // 2) Récupérer les infos joueurs (points FFTT pour le seeding final)
  const { data: catPlayers, error: cpError } = await supabase
    .from('category_players')
    .select('player_id, players(id, fftt_points, full_name)')
    .eq('category_id', categoryId);
  if (cpError) throw new Error(`Erreur lecture joueurs : ${cpError.message}`);

  const playerById = {};
  catPlayers.forEach((cp) => {
    playerById[cp.player_id] = cp.players;
  });

  const firsts = [];
  const seconds = [];
  const eliminatedIds = [];

  for (const pouleId of Object.keys(byPoule)) {
    const matches = byPoule[pouleId];
    const involvedIds = new Set();
    matches.forEach((m) => {
      involvedIds.add(m.player1_id);
      involvedIds.add(m.player2_id);
    });
    const players = [...involvedIds].map((id) => ({ id, fftt_points: playerById[id]?.fftt_points ?? 0 }));

    const ranking = rankPoulePlayers(matches, players);

    ranking.forEach((entry, position) => {
      if (position === 0) firsts.push(entry.player);
      else if (position === 1 && players.length > 2) seconds.push(entry.player);
      else eliminatedIds.push(entry.player.id); // dernier de la poule (ou 2e d'une poule de 2)
    });
  }

  // Joueurs déjà qualifiés directement (poules de 1, cf. generatePoules)
  const { data: directQualifiers } = await supabase
    .from('category_players')
    .select('player_id, players(id, fftt_points)')
    .eq('category_id', categoryId)
    .eq('status', 'in_bracket');
  const directList = (directQualifiers || []).map((r) => ({ id: r.player_id, fftt_points: r.players?.fftt_points ?? 0 }));

  // 3) Marquer les éliminés
  if (eliminatedIds.length > 0) {
    const { error: elimError } = await supabase
      .from('category_players')
      .update({ status: 'eliminated' })
      .eq('category_id', categoryId)
      .in('player_id', eliminatedIds);
    if (elimError) throw new Error(`Erreur élimination : ${elimError.message}`);
  }

  // 4) Seeding : 1ers de poule d'abord (triés par points), puis 2èmes
  firsts.sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));
  seconds.sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));
  const seededQualifiers = [...directList, ...firsts, ...seconds];

  const nbQualifiers = seededQualifiers.length;
  const bracketSize = nextPowerOfTwo(nbQualifiers);
  const roundType = ROUND_TYPES_BY_SIZE[bracketSize] || 'round_64';

  // 5) Placement dans la grille avec byes pour les mieux classés
  //    si l'arbre est incomplet (ex: 12 qualifiés pour un arbre de 16 -> 4 byes)
  const nbByes = bracketSize - nbQualifiers;
  const seedPositions = standardSeedPositions(bracketSize); // positions 0..bracketSize-1 dans l'ordre des seeds

  // Grille finale : bracketSize slots, chacun soit un joueur (bye direct
  // au tour suivant), soit un match de "tour préliminaire" à jouer.
  const slots = new Array(bracketSize).fill(null);
  seededQualifiers.forEach((player, seedIndex) => {
    if (seedIndex < seededQualifiers.length) {
      const pos = seedPositions[seedIndex];
      slots[pos] = player;
    }
  });
  // Les byes vont aux meilleurs seeds (déjà placés en premier dans seedPositions
  // grâce à l'ordre standard) : les positions non comblées par un qualifié
  // resteront `null` -> ce sont des "byes" pour l'adversaire en face.

  // 6) Construction du 1er tour réel (tour préliminaire), en respectant
  //    les byes : chaque paire (slots[2i], slots[2i+1]) donne soit un
  //    match normal, soit un bye si l'un des deux est vide.
  const firstRoundMatchesPayload = [];
  const firstRoundResults = []; // { matchId (or null si bye), advancingPlayer }

  for (let i = 0; i < bracketSize / 2; i += 1) {
    const p1 = slots[2 * i];
    const p2 = slots[2 * i + 1];

    if (p1 && p2) {
      firstRoundMatchesPayload.push({
        category_id: categoryId,
        round_type: nbByes > 0 ? 'poule_prelim' : roundType, // voir note ci-dessous
        player1_id: p1.id,
        player2_id: p2.id,
        status: 'scheduled',
        is_bye: false,
        pairIndex: i,
      });
    } else {
      // Bye : le joueur présent avance directement, aucun match à jouer
      const advancing = p1 || p2;
      firstRoundResults.push({ pairIndex: i, advancingPlayer: advancing, isBye: true });
    }
  }

  // NOTE : round_type 'poule_prelim' n'est pas dans la liste imposée par
  // le cahier des charges (poule, round_64...final). On utilise le
  // round_type directement supérieur (roundType) pour les matchs
  // préliminaires réels, car ils appartiennent physiquement à ce tour :
  firstRoundMatchesPayload.forEach((m) => { m.round_type = roundType; });

  // Insertion des matchs du "tour réel" (préliminaires + tour normal
  // s'il n'y avait pas de byes)
  let insertedFirstRound = [];
  if (firstRoundMatchesPayload.length > 0) {
    const cleanPayload = firstRoundMatchesPayload.map(({ pairIndex, ...rest }) => ({ ...rest, pairIndex }));
    const { data: inserted, error: insError } = await supabase
      .from('matches')
      .insert(cleanPayload)
      .select('id, player1_id, player2_id');
    if (insError) throw new Error(`Erreur création tour préliminaire : ${insError.message}`);
    insertedFirstRound = inserted.map((row, idx) => ({
      ...row,
      pairIndex: cleanPayload[idx].pairIndex,
    }));
  }

  // 7) Construction des tours suivants (vide, à remplir au fur et à
  // mesure des victoires) avec chaînage next_match_id

  // On fusionne matchs réels + byes du 1er tour, dans l'ordre des pairIndex,
  // pour connaître qui/quoi arrive au tour 2.
  const round1Map = new Array(bracketSize / 2).fill(null);
  insertedFirstRound.forEach((m) => { round1Map[m.pairIndex] = { matchId: m.id, isBye: false }; });
  firstRoundResults.forEach((r) => { round1Map[r.pairIndex] = { matchId: null, isBye: true, player: r.advancingPlayer }; });

  let currentLevel = round1Map; // ce que le tour suivant va consommer
  let sizeAtThisRound = bracketSize / 2;
  const allRoundsCreated = [insertedFirstRound];

  while (sizeAtThisRound >= 1) {
    const nextSize = Math.floor(sizeAtThisRound / 2);
    if (nextSize === 0) break; // on vient de créer la finale, terminé

    const nextRoundType = ROUND_TYPES_BY_SIZE[nextSize * 2] || ROUND_TYPES_BY_SIZE[2];
    const nextMatchesPayload = [];
    for (let i = 0; i < nextSize; i += 1) {
      nextMatchesPayload.push({
        category_id: categoryId,
        round_type: nextRoundType,
        status: 'scheduled',
        is_bye: false,
      });
    }

    const { data: nextInserted, error: nextErr } = await supabase
      .from('matches')
      .insert(nextMatchesPayload)
      .select('id');
    if (nextErr) throw new Error(`Erreur création tour ${nextRoundType} : ${nextErr.message}`);

    // Chaînage : chaque paire du niveau courant pointe vers le match du niveau suivant
    for (let i = 0; i < sizeAtThisRound; i += 1) {
      const targetMatch = nextInserted[Math.floor(i / 2)];
      const source = currentLevel[i];
      if (!source) continue;

      if (source.isBye) {
        // Bye : on place directement le joueur dans le match suivant
        // (comme player1 si i pair, player2 si i impair)
        const field = i % 2 === 0 ? 'player1_id' : 'player2_id';
        const { error: byeErr } = await supabase
          .from('matches')
          .update({ [field]: source.player.id })
          .eq('id', targetMatch.id);
        if (byeErr) throw new Error(`Erreur placement bye : ${byeErr.message}`);
      } else {
        const { error: linkErr } = await supabase
          .from('matches')
          .update({ next_match_id: targetMatch.id })
          .eq('id', source.matchId);
        if (linkErr) throw new Error(`Erreur chaînage next_match_id : ${linkErr.message}`);
      }
    }

    currentLevel = nextInserted.map((m) => ({ matchId: m.id, isBye: false }));
    sizeAtThisRound = nextSize;
    allRoundsCreated.push(nextInserted);
  }

  // 8) Mettre à jour le statut des qualifiés
  const qualifiedIds = seededQualifiers.map((p) => p.id);
  if (qualifiedIds.length > 0) {
    const { error: qualErr } = await supabase
      .from('category_players')
      .update({ status: 'in_bracket' })
      .eq('category_id', categoryId)
      .in('player_id', qualifiedIds);
    if (qualErr) throw new Error(`Erreur statut in_bracket : ${qualErr.message}`);
  }

  return {
    bracketSize,
    nbQualifiers,
    nbByes,
    roundsCreated: allRoundsCreated.length,
  };
}

// =======================================================================
// PHASE 4 : ORDONNANCEUR ANTI-COLLISION (SCHEDULER)
// =======================================================================

/**
 * Version "batch" : vérifie une liste de joueurs en une seule requête
 * (bien plus performant que de multiplier les appels individuels quand la
 * file d'attente est longue).
 */
async function getBusyPlayerIds(playerIds) {
  if (playerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('matches')
    .select('player1_id, player2_id')
    .eq('status', 'playing');
  if (error) throw new Error(`Erreur lecture matchs en cours : ${error.message}`);

  const busy = new Set();
  data.forEach((m) => {
    busy.add(m.player1_id);
    busy.add(m.player2_id);
  });
  return busy;
}

/**
 * Récupère la file d'attente triée par priorité :
 * 1) Les poules non commencées (priorité haute, elles bloquent le plus
 *    de joueurs simultanément)
 * 2) Puis les matchs de l'arbre final, dans l'ordre de création
 *    (les tours amont d'abord)
 */
async function getScheduledQueue(categoryId) {
  let query = supabase
    .from('matches')
    .select('id, poule_id, round_type, player1_id, player2_id, created_at')
    .eq('status', 'scheduled')
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null) // ignore les matchs de l'arbre pas encore complets (en attente d'un autre résultat)
    .order('created_at', { ascending: true });

  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) throw new Error(`Erreur lecture file d'attente : ${error.message}`);

  // Regrouper les matchs de poule par poule_id (on ne veut que le
  // "premier match" de chaque poule dans la file, car assignPouleToTable
  // gère l'enchaînement interne)
  const seenPoules = new Set();
  const queue = [];
  for (const m of data) {
    if (m.round_type === 'poule') {
      if (seenPoules.has(m.poule_id)) continue; // déjà représenté dans la file
      seenPoules.add(m.poule_id);
      queue.push({ type: 'poule', pouleId: m.poule_id, players: [m.player1_id, m.player2_id] });
    } else {
      queue.push({ type: 'bracket', matchId: m.id, players: [m.player1_id, m.player2_id] });
    }
  }

  // Priorité : poules d'abord (elles impliquent plus de joueurs à débloquer)
  queue.sort((a, b) => (a.type === b.type ? 0 : a.type === 'poule' ? -1 : 1));
  return queue;
}

/** Récupère les tables actuellement libres. */
async function getFreeTables() {
  const { data, error } = await supabase.from('tables').select('id, label').eq('status', 'free');
  if (error) throw new Error(`Erreur lecture tables libres : ${error.message}`);
  return data;
}

/**
 * Point d'entrée du bouton "Lancer les prochains matchs".
 * Scanne la file d'attente par priorité, et pour chaque table libre,
 * assigne le premier match/poule de la file dont AUCUN joueur n'est
 * déjà en train de jouer ailleurs (anti-collision).
 *
 * @param {string|null} categoryId - si null, scanne toutes les catégories
 * @returns {Promise<Array>} liste des assignations effectuées
 */
export async function launchNextMatches(categoryId = null) {
  const [freeTables, queue] = await Promise.all([
    getFreeTables(),
    getScheduledQueue(categoryId),
  ]);

  if (freeTables.length === 0) {
    return { assigned: [], reason: 'no_free_tables' };
  }
  if (queue.length === 0) {
    return { assigned: [], reason: 'empty_queue' };
  }

  // On récupère l'ensemble des joueurs actuellement occupés UNE seule fois,
  // puis on le met à jour localement au fur et à mesure des assignations
  // de cette passe (pour ne pas assigner deux fois le même joueur sur deux
  // tables libérées dans le même cycle).
  const allPlayerIds = [...new Set(queue.flatMap((q) => q.players))];
  const busyPlayers = await getBusyPlayerIds(allPlayerIds);

  const assigned = [];
  const skipped = [];
  let tableIndex = 0;

  for (const item of queue) {
    if (tableIndex >= freeTables.length) break; // plus de table libre

    const collision = item.players.some((pid) => busyPlayers.has(pid));
    if (collision) {
      skipped.push({ ...item, reason: 'player_already_playing' });
      continue; // on IGNORE ce match et on teste le suivant dans la file
    }

    const table = freeTables[tableIndex];

    try {
      if (item.type === 'poule') {
        await assignPouleToTable(item.pouleId, table.id);
      } else {
        await assignBracketMatchToTable(item.matchId, table.id);
      }
      assigned.push({ ...item, tableId: table.id });
      // Marquer ces joueurs comme occupés pour le reste de cette passe
      item.players.forEach((pid) => busyPlayers.add(pid));
      tableIndex += 1;
    } catch (err) {
      // En cas d'échec (ex: condition de course avec un autre appel
      // concurrent), on log et on passe au suivant sans bloquer le reste.
      skipped.push({ ...item, reason: 'assignment_failed', error: err.message });
    }
  }

  return { assigned, skipped };
}

/**
 * Assigne un match de l'arbre final (hors poule) à une table libre.
 * Simple mise à jour car il n'y a pas de logique "poule" à gérer,
 * mais on repasse par une vérification de dernière seconde en base
 * pour éviter toute condition de course entre la lecture de la queue
 * et l'assignation effective.
 */
export async function assignBracketMatchToTable(matchId, tableId) {
  const { data: match, error: mErr } = await supabase
    .from('matches')
    .select('player1_id, player2_id, status')
    .eq('id', matchId)
    .single();
  if (mErr) throw new Error(`Match introuvable : ${mErr.message}`);
  if (match.status !== 'scheduled') {
    throw new Error('Ce match n\'est plus disponible (déjà assigné ou joué).');
  }

  const busy = await getBusyPlayerIds([match.player1_id, match.player2_id]);
  if (busy.has(match.player1_id) || busy.has(match.player2_id)) {
    throw new Error('Un des joueurs est déjà en train de jouer ailleurs.');
  }

  const { data: table, error: tErr } = await supabase
    .from('tables')
    .select('status')
    .eq('id', tableId)
    .single();
  if (tErr) throw new Error(`Table introuvable : ${tErr.message}`);
  if (table.status !== 'free') throw new Error('Cette table n\'est plus libre.');

  const { error: updTableErr } = await supabase.from('tables').update({ status: 'busy' }).eq('id', tableId);
  if (updTableErr) throw new Error(`Erreur mise à jour table : ${updTableErr.message}`);

  const { error: updMatchErr } = await supabase
    .from('matches')
    .update({ status: 'playing', table_id: tableId })
    .eq('id', matchId);
  if (updMatchErr) {
    // Rollback manuel de la table si la mise à jour du match échoue
    await supabase.from('tables').update({ status: 'free' }).eq('id', tableId);
    throw new Error(`Erreur mise à jour match : ${updMatchErr.message}`);
  }

  return { matchId, tableId };
}

/**
 * Enregistre le résultat d'un match de l'arbre final et fait avancer
 * automatiquement le gagnant dans le match suivant (next_match_id).
 * Opération atomique via RPC Postgres.
 */
export async function submitBracketMatchResult(matchId, score1, score2, winnerId, loserId) {
  const { data, error } = await supabase.rpc('advance_bracket_winner', {
    p_match_id: matchId,
    p_score1: score1,
    p_score2: score2,
    p_winner_id: winnerId,
    p_loser_id: loserId,
  });
  if (error) throw new Error(`Erreur avancement dans l'arbre : ${error.message}`);
  return data; // { next_match_id }
}

// =======================================================================
// EXPORT GROUPÉ
// =======================================================================

export default {
  // Phase 1
  computePouleSizes,
  distributeSerpentine,
  generatePoules,
  // Phase 2
  assignPouleToTable,
  submitPouleMatchResult,
  // Phase 3
  generateBracket,
  // Phase 4
  launchNextMatches,
  assignBracketMatchToTable,
  submitBracketMatchResult,
};
