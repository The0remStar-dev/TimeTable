import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { createCategory, createPlayerWithCategories, fetchCategoriesWithCounts } from '../services/tournamentService';
import { launchNextMatches, assignBracketMatchToTable, assignPouleToTable } from '../services/tournamentEngine';

const TournamentContext = createContext(null);

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
    if (!tournamentId) return;
    const { data } = await supabase.from('tables').select('*').eq('tournament_id', tournamentId).order('id');
    if (data) setTables(data);
  }, [tournamentId]);

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await supabase.from('players').select('*').eq('tournament_id', tournamentId).order('name');
    if (data) setPlayers(data);
  }, [tournamentId]);

  const loadMatches = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await supabase.from('matches').select('*').eq('tournament_id', tournamentId).order('created_at');
    if (data) setMatches(data);
  }, [tournamentId]);

  const loadCategories = useCallback(async () => {
    if (!tournamentId) return;
    const res = await fetchCategoriesWithCounts(tournamentId);
    if (res.data) setCategories(res.data);
  }, [tournamentId]);

  const loadAll = useCallback(() => {
    loadTables();
    loadPlayers();
    loadMatches();
    loadCategories();
  }, [loadTables, loadPlayers, loadMatches, loadCategories]);

  // load current tournament (first available) if none provided
  const loadCurrentTournament = useCallback(async () => {
    if (tournamentId) return;
    const { data, error } = await supabase.from('tournaments').select('id').limit(1).single();
    if (error) return;
    if (data && data.id) {
      setCurrentTournament(data);
      setTournamentId(data.id);
    }
  }, [tournamentId]);

  useEffect(() => {
    // ensure we have a tournament id first
    loadCurrentTournament();
  }, [loadCurrentTournament]);

  useEffect(() => {
    if (!tournamentId || String(tournamentId) === '1') return;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, () => loadMatches())
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
      } catch (e) {
        // ignore
      }
    };
  }, [loadAll, loadTables, loadPlayers, loadMatches, loadCategories, tournamentId, loadCurrentTournament]);

  // Actions
  const createTournament = async (name) => {
    if (!name) return { success: false, error: 'Tournament name required' };
    try {
      const generatedCode = Math.random().toString(36).slice(2,8).toUpperCase();
      const { data, error } = await supabase.from('tournaments').insert([{ name, status: 'draft', code: generatedCode }]).select().single();
      if (error) return { success: false, error: error.message || error };
      if (data) {
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
        .select('poule_id, status')
        .eq('id', matchId)
        .single();
      if (matchErr) throw matchErr;
      if (!match) throw new Error('Match introuvable.');

      if (match.poule_id) {
        await assignPouleToTable(match.poule_id, tableId);
      } else {
        await assignBracketMatchToTable(matchId, tableId);
      }

      loadMatches();
      loadTables();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const completeMatch = async (matchId, score, tableId) => {
    try {
      await supabase.from('matches').update({ status: 'completed', score, table_id: null, finished_at: new Date().toISOString() }).eq('id', matchId);
      await supabase.from('tables').update({ status: 'DISPONIBLE' }).eq('id', tableId);
      loadMatches();
      loadTables();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const autoAssignMatches = async () => {
    const result = await launchNextMatches(null, tournamentId);
    if (result.assigned?.length) {
      loadMatches();
      loadTables();
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
    completeMatch,
    autoAssignMatches
  };

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export default TournamentContext;
