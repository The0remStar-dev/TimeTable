import { supabase } from './supabaseClient';

const getAvailablePlayerRatingColumns = async () => {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'players');

    if (error || !data) return [];
    return data.map((col) => col.column_name);
  } catch {
    return [];
  }
};

// A. Créer une nouvelle catégorie (tableau) pour un tournoi
export const createCategory = async (tournamentId, name, startTime) => {
  if (!tournamentId || String(tournamentId) === '1') return { data: null, error: new Error('Invalid tournament id') };
  const { data, error } = await supabase
    .from('categories')
    .insert([{ tournament_id: tournamentId, name, start_time: startTime, status: 'draft' }])
    .select();
  return { data, error };
};

export const fetchCategoriesForTournament = async (tournamentId) => {
  if (!tournamentId || String(tournamentId) === '1') return { data: [], error: null };
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, start_time, status, tournament_id')
    .eq('tournament_id', tournamentId)
    .order('start_time', { ascending: true, nullsFirst: false });

  return { data: data || [], error };
};

export const updateCategoryStatus = async (categoryId, status) => {
  if (!categoryId) return { data: null, error: new Error('Invalid category id') };
  const { data, error } = await supabase
    .from('categories')
    .update({ status })
    .eq('id', categoryId)
    .select()
    .single();

  return { data, error };
};

export const deleteCategoryById = async (categoryId) => {
  if (!categoryId) return { success: false, error: 'Invalid category id' };
  try {
    const { error } = await supabase.from('categories').delete().eq('id', categoryId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// B. Créer un joueur et l'inscrire à 1 ou 2 tableaux en une seule action
export const createPlayerWithCategories = async (tournamentId, playerData, categoryIds = []) => {
  if (!tournamentId || String(tournamentId) === '1') return { success: false, error: 'Invalid tournament id' };
  try {
    if (categoryIds.length > 2) {
      throw new Error('Un joueur ne peut pas être inscrit dans plus de 2 tableaux.');
    }

    const rating = Number(playerData.fftt_points ?? playerData.points ?? 500);
    const availableRatingColumns = await getAvailablePlayerRatingColumns();

    // 1. Inscription du joueur
    const playerPayload = {
      tournament_id: tournamentId,
      name: playerData.name,
      email: playerData.email || null,
      payment_status: playerData.payment_status || 'unpaid',
    };

    if (rating !== undefined && rating !== null) {
      if (availableRatingColumns.includes('fftt_points')) {
        playerPayload.fftt_points = rating;
      }
      if (availableRatingColumns.includes('points')) {
        playerPayload.points = rating;
      }
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert([playerPayload])
      .select()
      .single();

    if (playerError) throw playerError;

    // 2. Association avec les tableaux sélectionnés
    if (categoryIds.length > 0) {
      const categoryRows = categoryIds.map((catId) => ({
        category_id: catId,
        player_id: player.id,
      }));

      const { error: joinError } = await supabase
        .from('category_players')
        .insert(categoryRows);

      if (joinError) throw joinError;
    }

    return { success: true, player };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const updatePlayerPaymentStatus = async (playerId, paid) => {
  if (!playerId) return { success: false, error: 'Invalid player id' };

  try {
    const payload = { payment_status: paid ? 'paid' : 'unpaid' };
    const { error } = await supabase.from('players').update(payload).eq('id', playerId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const deletePlayerById = async (playerId) => {
  if (!playerId) return { success: false, error: 'Invalid player id' };

  try {
    const { error } = await supabase.from('players').delete().eq('id', playerId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// C. Récupérer tous les tableaux avec le nombre actuel d'inscrits
export const fetchCategoriesWithCounts = async (tournamentId) => {
  if (!tournamentId || String(tournamentId) === '1') return { data: null, error: new Error('Invalid tournament id') };
  const { data, error } = await supabase
    .from('categories')
    .select('*, category_players(count), status')
    .eq('tournament_id', tournamentId);

  return { data, error };
};