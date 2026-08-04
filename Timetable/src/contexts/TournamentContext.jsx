import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { isUuid } from '../utils/helpers';
import {
  createCategory,
  createPlayerWithCategories,
  fetchCategoriesWithCounts,
  updatePlayerPaymentStatus,
  deletePlayerById,
  deleteCategoryById,
  updateCategoryStatus
} from '../services/tournamentService';
import {
  launchNextMatches,
  assignBracketMatchToTable,
  assignPouleToTable,
  submitPouleMatchResult,
  submitBracketMatchResult,
  generateBracket
} from '../services/tournamentEngine';

const TournamentContext = createContext(null);

const getPlayerRating = (player = {}) => Number(player?.fftt_points ?? player?.points ?? 0);

const DEFAULT_TABLES_COUNT = 10;

// Un tournoi sans lignes dans `tables` ne peut lancer aucun match :
// on provisionne les tables physiques à la sélection du tournoi.
async function ensureTables(tournament) {
  if (!isUuid(tournament?.id)) return;

  const { data: existing, error } = await supabase
    .from('tables')
    .select('id')
    .eq('tournament_id', tournament.id)
    .limit(1);

  if (error) {
    console.error('[TournamentContext] Erreur lecture des tables', error);
    return;
  }
  if (existing.length > 0) return;

  const count = Number(tournament.tables_count) || DEFAULT_TABLES_COUNT;
  // Le libellé est dérivé du numéro côté UI : ne pas dépendre de tables.name.
  const rows = Array.from({ length: count }, (_, index) => ({
    tournament_id: tournament.id,
    number: index + 1,
    status: 'free',
  }));

  const { error: insertError } = await supabase.from('tables').insert(rows);
  if (insertError) {
    console.error('[TournamentContext] Erreur création des tables', insertError);
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTournament() {
  return useContext(TournamentContext);
}

export function TournamentProvider({ children, initialTournamentId = null }) {
  const [currentTournament, setCurrentTournament] = useState(null);
  const [tournamentId, setTournamentId] = useState(initialTournamentId);
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);

  const loadTables = useCallback(async () => {
    if (!isUuid(tournamentId)) return;
    const { data } = await supabase.from('tables').select('*').eq('tournament_id', tournamentId).order('number');
    if (data) setTables(data);
  }, [tournamentId]);

  const loadPlayers = useCallback(async () => {
    if (!isUuid(tournamentId)) return;
    const { data } = await supabase
      .from('players')
      .select('*, category_players(status, category_id, categories(name))')
      .eq('tournament_id', tournamentId)
      .order('name');

    if (data) {
      const normalized = data.map((player) => {
        const assignedCategories = (player.category_players || [])
          .map((link) => link?.categories?.name)
          .filter(Boolean);
        const assignedStatus = player.category_players?.[0]?.status || 'in_poules';
        const assignedCategory = assignedCategories[0] || 'Tableau principal';
        const paid = Boolean(player.payment_status === 'paid' || player.is_paid === true || player.paid === true);

        return {
          ...player,
          name: player.name || player.full_name || 'Joueur',
          fftt_points: getPlayerRating(player),
          points: player.points ?? getPlayerRating(player),
          status: assignedStatus,
          category: assignedCategory,
          categories: assignedCategories,
          paid,
          payment_status: player.payment_status || (paid ? 'paid' : 'unpaid'),
        };
      });
      setPlayers(normalized);
    }
  }, [tournamentId]);

  // Les matchs ne portent pas de tournament_id : ils sont rattachés aux tableaux
  // (categories) du tournoi.
  const loadMatches = useCallback(async () => {
    if (!isUuid(tournamentId)) return;

    const { data: categoryRows } = await supabase
      .from('categories')
      .select('id')
      .eq('tournament_id', tournamentId);

    const categoryIds = (categoryRows || []).map((category) => category.id).filter(isUuid);
    if (categoryIds.length === 0) {
      setMatches([]);
      return;
    }

    const { data } = await supabase
      .from('matches')
      .select('*')
      .in('category_id', categoryIds)
      .order('created_at');
    if (data) setMatches(data);
  }, [tournamentId]);

  const loadCategories = useCallback(async () => {
    if (!isUuid(tournamentId)) return;
    const res = await fetchCategoriesWithCounts(tournamentId);
    if (res.data) setCategories(res.data);
  }, [tournamentId]);

  const loadAll = useCallback(() => {
    loadTables();
    loadPlayers();
    loadMatches();
    loadCategories();
  }, [loadTables, loadPlayers, loadMatches, loadCategories]);

  // Reprise de session : sans tournoi explicite on repart du dernier créé,
  // ce qui évite tout identifiant de repli codé en dur.
  useEffect(() => {
    if (tournamentId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[TournamentContext] Erreur chargement du dernier tournoi', error);
        return;
      }
      if (cancelled || !data) return;

      await ensureTables(data);
      setCurrentTournament(data);
      setTournamentId(data.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!isUuid(tournamentId)) return undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();

    const tablesSub = supabase
      .channel('public:tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `tournament_id=eq.${tournamentId}` }, () => loadTables())
      .subscribe();

    const playersSub = supabase
      .channel('public:players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `tournament_id=eq.${tournamentId}` }, () => loadPlayers())
      .subscribe();

    const matchesSub = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => loadMatches())
      .subscribe();

    const categoriesSub = supabase
      .channel('public:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `tournament_id=eq.${tournamentId}` }, () => loadCategories())
      .subscribe();

    const catPlayersSub = supabase
      .channel('public:category_players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'category_players' }, () => loadCategories())
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(tablesSub);
        supabase.removeChannel(playersSub);
        supabase.removeChannel(matchesSub);
        supabase.removeChannel(categoriesSub);
        supabase.removeChannel(catPlayersSub);
      } catch {
        // ignore
      }
    };
  }, [loadAll, loadTables, loadPlayers, loadMatches, loadCategories, tournamentId]);

  // Actions
  const createTournament = async (name) => {
    if (!name) return { success: false, error: 'Tournament name required' };
    try {
      const generatedCode = Math.random().toString(36).slice(2,8).toUpperCase();
      const { data, error } = await supabase.from('tournaments').insert([{ name, status: 'draft', code: generatedCode }]).select().single();
      if (error) return { success: false, error: error.message || error };
      if (data) {
        await ensureTables(data);
        setCurrentTournament(data);
        setTournamentId(data.id);
        // load related data
        loadAll();
        return { success: true, data };
      }
      return { success: false, error: 'No data returned' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const addCategory = async (name, start_time) => {
    if (!tournamentId) return { error: 'No tournament selected' };
    return createCategory(tournamentId, name, start_time);
  };

  const addPlayerWithCategories = async (playerData, categoryIds) => {
    if (!tournamentId) return { success: false, error: 'No tournament selected' };
    const res = await createPlayerWithCategories(tournamentId, playerData, categoryIds);
    if (res.success) {
      // load players and categories again
      loadPlayers();
      loadCategories();
    }
    return res;
  };

  const assignMatchToTable = async (matchId, tableId) => {
    try {
      const { data: match, error: matchErr } = await supabase
        .from('matches')
        .select('poule_id, status, round_type')
        .eq('id', matchId)
        .single();
      if (matchErr) throw matchErr;
      if (!match) throw new Error('Match introuvable.');

      if (match.poule_id || match.round_type === 'poule') {
        await assignPouleToTable(match.poule_id || matchId, tableId);
      } else {
        await assignBracketMatchToTable(matchId, tableId);
      }

      // Realtime will handle updates, but also trigger immediate refresh
      loadMatches();
      loadTables();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const completeMatch = async (matchId, score, tableId) => {
    try {
      // First get match details to determine if it's a bracket match
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('round_type, player1_id, player2_id, score1, score2')
        .eq('id', matchId)
        .single();

      if (matchError) throw matchError;

      // Parse score to determine winner
      const scoreParts = score.split(',').map(s => s.trim());
      const lastSet = scoreParts[scoreParts.length - 1] || score;
      const [s1, s2] = lastSet.split('-').map(Number);
      
      const winnerId = s1 > s2 ? matchData.player1_id : s2 > s1 ? matchData.player2_id : null;
      const loserId = s1 > s2 ? matchData.player2_id : s2 > s1 ? matchData.player1_id : null;

      if (matchData.round_type !== 'poule' && winnerId && loserId) {
        // Use bracket match result submission with winner advancement
        await submitBracketMatchResult(matchId, s1, s2, winnerId, loserId);
      } else {
        // Regular completion for poule matches or edge cases
        await supabase.from('matches').update({ status: 'completed', score, table_id: null, finished_at: new Date().toISOString() }).eq('id', matchId);
      }

      if (isUuid(tableId)) {
        await supabase.from('tables').update({ status: 'free' }).eq('id', tableId);
      }
      
      // Trigger immediate state refreshes for realtime updates
      loadMatches();
      loadTables();
      loadPlayers(); // Refresh players to update their status
      loadCategories(); // Refresh categories in case bracket was generated
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const autoAssignMatches = async () => {
    const categoryIds = categories.map((category) => category.id).filter(isUuid);
    const result = await launchNextMatches(categoryIds, tournamentId);
    if (result.assigned?.length) {
      // Trigger immediate state refreshes for realtime updates
      loadMatches();
      loadTables();
      loadPlayers(); // Refresh players to update their status
    }
    return result;
  };

  const value = {
    currentTournament,
    setCurrentTournament,
    tables,
    categories,
    players,
    matches,
    loadAll,
    addCategory,
    addPlayerWithCategories,
    createTournament,
    assignMatchToTable,
    assignPouleToTable,
    submitPouleMatchResult,
    submitBracketMatchResult,
    generateBracket,
    completeMatch,
    autoAssignMatches,
    updatePlayerPaymentStatus,
    deletePlayerById,
    deleteCategoryById,
    updateCategoryStatus
  };

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

