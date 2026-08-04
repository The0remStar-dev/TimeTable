import { supabase } from './supabaseClient';
import { isUuid } from '../utils/helpers';

const invalidId = (entity) => new Error(`Identifiant ${entity} invalide : un UUID est requis.`);

// A. Créer une nouvelle catégorie (tableau) pour un tournoi
export const createCategory = async (tournamentId, name, startTime) => {
  if (!isUuid(tournamentId)) return { data: null, error: invalidId('de tournoi') };
  const { data, error } = await supabase
    .from('categories')
    .insert([{ tournament_id: tournamentId, name, start_time: startTime, status: 'draft' }])
    .select();
  return { data, error };
};

export const fetchCategoriesForTournament = async (tournamentId) => {
  if (!isUuid(tournamentId)) return { data: [], error: null };
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, start_time, status, tournament_id')
    .eq('tournament_id', tournamentId)
    .order('start_time', { ascending: true, nullsFirst: false });

  return { data: data || [], error };
};

export const updateCategoryStatus = async (categoryId, status) => {
  if (!isUuid(categoryId)) return { data: null, error: invalidId('de tableau') };
  const { data, error } = await supabase
    .from('categories')
    .update({ status })
    .eq('id', categoryId)
    .select()
    .single();

  return { data, error };
};

export const deleteCategoryById = async (categoryId) => {
  if (!isUuid(categoryId)) return { success: false, error: invalidId('de tableau').message };
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
  if (!isUuid(tournamentId)) return { success: false, error: invalidId('de tournoi').message };
  try {
    if (categoryIds.length > 2) {
      throw new Error('Un joueur ne peut pas être inscrit dans plus de 2 tableaux.');
    }
    if (!categoryIds.every(isUuid)) {
      throw new Error(invalidId('de tableau').message);
    }

    const rating = Number(playerData.fftt_points ?? playerData.points ?? 500);

    // 1. Inscription du joueur
    const playerPayload = {
      tournament_id: tournamentId,
      name: playerData.name,
      email: playerData.email || null,
      payment_status: playerData.payment_status || 'unpaid',
      fftt_points: rating,
      points: rating,
    };

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
  if (!isUuid(playerId)) return { success: false, error: invalidId('de joueur').message };

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
  if (!isUuid(playerId)) return { success: false, error: invalidId('de joueur').message };

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
  if (!isUuid(tournamentId)) return { data: null, error: invalidId('de tournoi') };
  const { data, error } = await supabase
    .from('categories')
    .select('*, category_players(count), status')
    .eq('tournament_id', tournamentId);

  return { data, error };
};