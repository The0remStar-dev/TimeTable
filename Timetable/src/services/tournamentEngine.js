/**
 * tournamentEngine.js
 * ---------------------------------------------------------------------
 * Cœur algorithmique du tournoi de tennis de table.
 * Gère : génération des poules, règle "1 table = 1 poule",
 * génération de l'arbre final (knockout) avec byes, et l'ordonnanceur
 * anti-collision de la file d'attente.
 *
 * Prérequis : migration SQL appliquée (nouveaux champs + fonctions RPC).
 * ---------------------------------------------------------------------
 */

import { supabase } from './supabaseClient';

// =======================================================================
// UTILITAIRES GÉNÉRAUX
// =======================================================================

function nextPowerOfTwo(n) {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

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

export function computePouleSizes(n) {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [2];
  if (n === 3) return [3];
  if (n === 4) return [2, 2];

  const remainder = n % 3;
  if (remainder === 0) {
    return Array(n / 3).fill(3);
  }
  if (remainder === 1) {
    const nbPoulesDe3 = (n - 4) / 3;
    return [...Array(nbPoulesDe3).fill(3), 2, 2];
  }
  const nbPoulesDe3 = (n - 2) / 3;
  return [...Array(nbPoulesDe3).fill(3), 2];
}

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
    if (round > sortedPlayers.length + k) break;
  }
  return poules;
}

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

  return matches;
}

export async function generatePoules(categoryId, playersList) {
  if (!playersList || playersList.length === 0) {
    throw new Error('Liste de joueurs vide pour generatePoules');
  }

  const sorted = [...playersList].sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));
  const pouleSizes = computePouleSizes(sorted.length);
  const poules = distributeSerpentine(sorted, pouleSizes);

  const createdPoules = [];
  const allMatchesPayload = [];
  const soloQualifiers = [];

  for (const players of poules) {
    if (players.length === 1) {
      soloQualifiers.push(players[0]);
      continue;
    }
    const pouleId = crypto.randomUUID();
    createdPoules.push({ pouleId, players });
    allMatchesPayload.push(...buildPouleMatchesPayload(categoryId, pouleId, players));
  }

  if (allMatchesPayload.length > 0) {
    const { error: matchError } = await supabase.from('matches').insert(allMatchesPayload);
    if (matchError) throw new Error(`Erreur création matchs de poules : ${matchError.message}`);
  }

  if (soloQualifiers.length > 0) {
    const { error: soloError } = await supabase
      .from('category_players')
      .update({ status: 'in_bracket' })
      .eq('category_id', categoryId)
      .in('player_id', soloQualifiers.map((p) => p.id));
    if (soloError) throw new Error(`Erreur qualification directe : ${soloError.message}`);
  }

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

export async function assignPouleToTable(pouleId, tableId) {
  const { data, error } = await supabase.rpc('assign_poule_to_table', {
    p_poule_id: pouleId,
    p_table_id: tableId,
  });
  if (error) throw new Error(`Impossible d'assigner la poule à la table : ${error.message}`);
  return data;
}

export async function submitPouleMatchResult(matchId, score1, score2, winnerId) {
  const { data, error } = await supabase.rpc('complete_poule_match', {
    p_match_id: matchId,
    p_score1: score1,
    p_score2: score2,
    p_winner_id: winnerId,
  });
  if (error) throw new Error(`Erreur en enregistrant le résultat de poule : ${error.message}`);
  return data;
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

export async function generateBracket(categoryId) {
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

  const byPoule = {};
  pouleMatches.forEach((m) => {
    byPoule[m.poule_id] = byPoule[m.poule_id] || [];
    byPoule[m.poule_id].push(m);
  });

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
      else eliminatedIds.push(entry.player.id);
    });
  }

  const { data: directQualifiers } = await supabase
    .from('category_players')
    .select('player_id, players(id, fftt_points)')
    .eq('category_id', categoryId)
    .eq('status', 'in_bracket');
  const directList = (directQualifiers || []).map((r) => ({ id: r.player_id, fftt_points: r.players?.fftt_points ?? 0 }));

  if (eliminatedIds.length > 0) {
    const { error: elimError } = await supabase
      .from('category_players')
      .update({ status: 'eliminated' })
      .eq('category_id', categoryId)
      .in('player_id', eliminatedIds);
    if (elimError) throw new Error(`Erreur élimination : ${elimError.message}`);
  }

  firsts.sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));
  seconds.sort((a, b) => (b.fftt_points ?? 0) - (a.fftt_points ?? 0));
  const seededQualifiers = [...directList, ...firsts, ...seconds];

  const nbQualifiers = seededQualifiers.length;
  const bracketSize = nextPowerOfTwo(nbQualifiers);
  const roundType = ROUND_TYPES_BY_SIZE[bracketSize] || 'round_64';

  const nbByes = bracketSize - nbQualifiers;
  const seedPositions = standardSeedPositions(bracketSize);

  const slots = new Array(bracketSize).fill(null);
  seededQualifiers.forEach((player, seedIndex) => {
    const pos = seedPositions[seedIndex];
    slots[pos] = player;
  });

  const firstRoundMatchesPayload = [];
  const firstRoundResults = [];

  for (let i = 0; i < bracketSize / 2; i += 1) {
    const p1 = slots[2 * i];
    const p2 = slots[2 * i + 1];

    if (p1 && p2) {
      firstRoundMatchesPayload.push({
        category_id: categoryId,
        round_type: roundType,
        player1_id: p1.id,
        player2_id: p2.id,
        status: 'scheduled',
        is_bye: false,
        _pairIndex: i,
      });
    } else {
      const advancing = p1 || p2;
      firstRoundResults.push({ pairIndex: i, advancingPlayer: advancing, isBye: true });
    }
  }

  let insertedFirstRound = [];
  if (firstRoundMatchesPayload.length > 0) {
    const cleanPayload = firstRoundMatchesPayload.map(({ _pairIndex, ...rest }) => rest);
    const { data: inserted, error: insError } = await supabase
      .from('matches')
      .insert(cleanPayload)
      .select('id, player1_id, player2_id');
    if (insError) throw new Error(`Erreur création tour préliminaire : ${insError.message}`);
    insertedFirstRound = inserted.map((row, idx) => ({
      ...row,
      pairIndex: firstRoundMatchesPayload[idx]._pairIndex,
    }));
  }

  const round1Map = new Array(bracketSize / 2).fill(null);
  insertedFirstRound.forEach((m) => { round1Map[m.pairIndex] = { matchId: m.id, isBye: false }; });
  firstRoundResults.forEach((r) => { round1Map[r.pairIndex] = { matchId: null, isBye: true, player: r.advancingPlayer }; });

  let currentLevel = round1Map;
  let sizeAtThisRound = bracketSize / 2;
  const allRoundsCreated = [insertedFirstRound];

  while (sizeAtThisRound >= 1) {
    const nextSize = Math.floor(sizeAtThisRound / 2);
    if (nextSize === 0) break;

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

    for (let i = 0; i < sizeAtThisRound; i += 1) {
      const targetMatch = nextInserted[Math.floor(i / 2)];
      const source = currentLevel[i];
      if (!source) continue;

      if (source.isBye) {
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

async function getBusyPlayerIds(playerIds) {
  if (playerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('matches')
    .select('player1_id, player2_id')
    .eq('status', 'playing');
  if (error) throw new Error(`Erreur lecture matchs en cours : ${error.message}`);

  const busy = new Set();
  data.forEach((m) => {
    if (m.player1_id) busy.add(m.player1_id);
    if (m.player2_id) busy.add(m.player2_id);
  });
  return busy;
}

async function getScheduledQueue(categoryId, tournamentId) {
  let query = supabase
    .from('matches')
    .select('id, poule_id, round_type, player1_id, player2_id, created_at, category_id, tournament_id')
    .eq('status', 'scheduled')
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null)
    .order('created_at', { ascending: true });

  if (categoryId) query = query.eq('category_id', categoryId);
  if (tournamentId) query = query.eq('tournament_id', tournamentId);

  const { data, error } = await query;
  if (error) throw new Error(`Erreur lecture file d'attente : ${error.message}`);

  const seenPoules = new Set();
  const queue = [];
  for (const m of data) {
    if (m.round_type === 'poule') {
      if (seenPoules.has(m.poule_id)) continue;
      seenPoules.add(m.poule_id);
      queue.push({ type: 'poule', pouleId: m.poule_id, players: [m.player1_id, m.player2_id], matchId: m.id, round_type: m.round_type, category_id: m.category_id });
    } else {
      queue.push({ type: 'bracket', matchId: m.id, players: [m.player1_id, m.player2_id], round_type: m.round_type, category_id: m.category_id });
    }
  }

  queue.sort((a, b) => (a.type === b.type ? 0 : a.type === 'poule' ? -1 : 1));
  return queue;
}

export async function getFreeTables() {
  const { data, error } = await supabase.from('tables').select('id, name, label, status').in('status', ['DISPONIBLE', 'free']);
  if (error) throw new Error(`Erreur lecture tables libres : ${error.message}`);
  return data;
}

export async function launchNextMatches(categoryId = null, tournamentId = null) {
  const [freeTables, queue] = await Promise.all([
    getFreeTables(),
    getScheduledQueue(categoryId, tournamentId),
  ]);

  if (freeTables.length === 0) {
    return { assigned: [], reason: 'no_free_tables' };
  }
  if (queue.length === 0) {
    return { assigned: [], reason: 'empty_queue' };
  }

  const allPlayerIds = [...new Set(queue.flatMap((q) => q.players))];
  const busyPlayers = await getBusyPlayerIds(allPlayerIds);

  const assigned = [];
  const skipped = [];
  let tableIndex = 0;

  for (const item of queue) {
    if (tableIndex >= freeTables.length) break;

    const collision = item.players.some((pid) => busyPlayers.has(pid));
    if (collision) {
      skipped.push({ ...item, reason: 'player_already_playing' });
      continue;
    }

    const table = freeTables[tableIndex];
    try {
      if (item.type === 'poule') {
        await assignPouleToTable(item.pouleId, table.id);
      } else {
        await assignBracketMatchToTable(item.matchId, table.id);
      }
      assigned.push({ ...item, tableId: table.id });
      item.players.forEach((pid) => busyPlayers.add(pid));
      tableIndex += 1;
    } catch (err) {
      skipped.push({ ...item, reason: 'assignment_failed', error: err.message });
    }
  }

  return { assigned, skipped };
}

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

  const allPlayerIds = [...new Set(queue.flatMap((q) => q.players))];
  const busyPlayers = await getBusyPlayerIds(allPlayerIds);

  const assigned = [];
  const skipped = [];
  let tableIndex = 0;

  for (const item of queue) {
    if (tableIndex >= freeTables.length) break;

    const collision = item.players.some((pid) => busyPlayers.has(pid));
    if (collision) {
      skipped.push({ ...item, reason: 'player_already_playing' });
      continue;
    }

    const table = freeTables[tableIndex];
    try {
      if (item.type === 'poule') {
        await assignPouleToTable(item.pouleId, table.id);
      } else {
        await assignBracketMatchToTable(item.matchId, table.id);
      }
      assigned.push({ ...item, tableId: table.id });
      item.players.forEach((pid) => busyPlayers.add(pid));
      tableIndex += 1;
    } catch (err) {
      skipped.push({ ...item, reason: 'assignment_failed', error: err.message });
    }
  }

  return { assigned, skipped };
  


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
  if (table.status !== 'DISPONIBLE' && table.status !== 'free') throw new Error('Cette table n\'est plus libre.');

  const { error: updTableErr } = await supabase.from('tables').update({ status: 'EN COURS' }).eq('id', tableId);
  if (updTableErr) throw new Error(`Erreur mise à jour table : ${updTableErr.message}`);

  const { error: updMatchErr } = await supabase
    .from('matches')
    .update({ status: 'playing', table_id: tableId, started_at: new Date().toISOString() })
    .eq('id', matchId);
  if (updMatchErr) {
    await supabase.from('tables').update({ status: 'DISPONIBLE' }).eq('id', tableId);
    throw new Error(`Erreur mise à jour match : ${updMatchErr.message}`);
  }

  return { matchId, tableId };
}

export async function submitBracketMatchResult(matchId, score1, score2, winnerId, loserId) {
  const { data, error } = await supabase.rpc('advance_bracket_winner', {
    p_match_id: matchId,
    p_score1: score1,
    p_score2: score2,
    p_winner_id: winnerId,
    p_loser_id: loserId,
  });
  if (error) throw new Error(`Erreur avancement dans l'arbre : ${error.message}`);
  return data;
}

export default {
  computePouleSizes,
  distributeSerpentine,
  generatePoules,
  assignPouleToTable,
  submitPouleMatchResult,
  generateBracket,
  launchNextMatches,
  assignBracketMatchToTable,
  submitBracketMatchResult,
};
