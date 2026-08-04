import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useTournament } from '../contexts/TournamentContext';
import { generatePoules } from '../services/tournamentEngine';

export default function ManageTournament() {
  const { currentTournament, categories, addCategory, addPlayerWithCategories, loadAll, createTournament, deleteCategoryById } = useTournament();
  const [newTournamentName, setNewTournamentName] = useState('Mon Tournoi');
  const [catName, setCatName] = useState('');
  const [catTime, setCatTime] = useState('');
  
  // Champs joueur
  const [playerName, setPlayerName] = useState('');
  const [playerPoints, setPlayerPoints] = useState(500);
  const [selectedCats, setSelectedCats] = useState([]);
  const [error, setError] = useState(null);
  const [launchingCategoryId, setLaunchingCategoryId] = useState(null);

  useEffect(() => {
    // context already loads categories; ensure data is fresh when mounting
    if (loadAll) loadAll();
  }, [loadAll]);

  // Ajouter un Tableau
  const handleAddCategory = async (e) => {
    e.preventDefault();
    setError(null);
    const res = await addCategory(catName, catTime);
    if (!res) {
      setError('Erreur inconnue lors de la création du tableau.');
      return;
    }

    if (res.error) {
      setError(res.error.message || String(res.error));
      return;
    }

    // success
    setCatName('');
    setCatTime('');
    if (loadAll) loadAll();
  };

  // Cocher/Décocher un tableau pour le joueur
  const handleCategoryToggle = (catId) => {
    if (selectedCats.includes(catId)) {
      setSelectedCats(selectedCats.filter((id) => id !== catId));
    } else {
      if (selectedCats.length >= 2) {
        setError('Limite atteinte : 2 tableaux maximum par joueur !');
        return;
      }
      setSelectedCats([...selectedCats, catId]);
    }
  };

  // Inscrire un joueur
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    setError(null);
    const res = await addPlayerWithCategories({ name: playerName, points: parseInt(playerPoints, 10), fftt_points: parseInt(playerPoints, 10) }, selectedCats);
    if (res.success) {
      setPlayerName('');
      setSelectedCats([]);
      if (loadAll) loadAll();
    } else {
      setError(res.error);
    }
  };

  const handleLaunchCategory = async (category) => {
    try {
      setError(null);
      setLaunchingCategoryId(category.id);

      const { data: categoryPlayersData, error: categoryPlayersError } = await supabase
        .from('category_players')
        .select('player_id, players(id, name, full_name, fftt_points, points, tournament_id)')
        .eq('category_id', category.id);

      if (categoryPlayersError) {
        console.error('[ManageTournament] Erreur lecture players du tableau', categoryPlayersError);
        throw new Error(categoryPlayersError.message || 'Erreur lecture joueurs du tableau.');
      }

      const playersInCategory = (categoryPlayersData || [])
        .map((row) => row.players || { id: row.player_id, player_id: row.player_id })
        .filter(Boolean)
        .map((player) => ({
          ...player,
          id: player.id ?? player.player_id,
          name: player.name || player.full_name || 'Joueur',
        }));

      if (playersInCategory.length < 2) {
        throw new Error('Il faut au moins 2 joueurs pour lancer un tableau.');
      }

      console.log('[ManageTournament] Lancement du tableau', {
        categoryId: category.id,
        players: playersInCategory.length,
      });

      const result = await generatePoules(category.id, playersInCategory, currentTournament?.id ?? null);
      if (result && result.poules) {
        const { error: categoryUpdateError } = await supabase
          .from('categories')
          .update({ status: 'in_progress' })
          .eq('id', category.id);

        if (categoryUpdateError) {
          console.error('[ManageTournament] Erreur mise à jour catégorie', categoryUpdateError);
          throw new Error(categoryUpdateError.message || 'Erreur mise à jour du statut du tableau.');
        }
      }

      if (loadAll) await loadAll();
      window.alert('Tableau lancé avec succès : les poules et les matchs ont bien été créés.');
    } catch (err) {
      console.error('[ManageTournament] Erreur lancement tableau', err);
      setError(err.message || 'Erreur lors du lancement du tableau.');
    } finally {
      setLaunchingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Supprimer ce tableau ? Cette action effacera les inscriptions et les matchs associés.')) return;
    const result = await deleteCategoryById(categoryId);
    if (!result.success) {
      setError(result.error || 'Erreur lors de la suppression du tableau.');
      return;
    }
    if (loadAll) await loadAll();
  };

  return (
    <div className="grid grid-cols-2 gap-8 p-6 bg-slate-50 min-h-screen">
      {!currentTournament && (
        <div className="col-span-2 mb-4 p-4 bg-yellow-50 border border-amber-200 text-amber-700 rounded-lg">
          <div className="flex items-center justify-between gap-4">
            <div>Aucun tournoi sélectionné — créez un tournoi pour commencer.</div>
            <div className="flex items-center gap-2">
              <input value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} className="px-3 py-1 rounded-lg border" />
              <button
                onClick={async () => {
                  setError(null);
                  const res = await createTournament(newTournamentName);
                  if (!res || res.error) setError(res?.error || 'Erreur création tournoi');
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white"
              >
                Créer le tournoi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* COLONNE 1 : Créer & Voir les Tableaux */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">1. Créer un Tableau</h3>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <input
              type="text"
              placeholder="ex: Tableau < 1200 pts"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-slate-200"
              disabled={!currentTournament}
            />
            <input
              type="datetime-local"
              value={catTime}
              onChange={(e) => setCatTime(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-slate-200"
              disabled={!currentTournament}
            />
            <button type="submit" disabled={!currentTournament} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl disabled:opacity-50">
              Ajouter le tableau
            </button>
          </form>
        </div>

        {/* Liste des tableaux avec jauges (Max 35) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Tableaux existants</h3>
          <div className="space-y-3">
            {categories.map((cat) => {
              const count = cat.category_players?.[0]?.count || 0;
              const status = cat.status || 'draft';
              return (
                <div key={cat.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{cat.name}</p>
                    <p className="text-xs text-slate-400">Début : {cat.start_time ? new Date(cat.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Non défini'}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mt-1">{status}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${count >= 35 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {count} / 35 joueurs
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleLaunchCategory(cat)}
                        disabled={launchingCategoryId === cat.id || count < 2}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                      >
                        {launchingCategoryId === cat.id ? 'Lancement...' : 'Lancer le tableau'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* COLONNE 2 : Inscrire un Joueur */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
        <h3 className="text-lg font-bold text-slate-900 mb-4">2. Inscrire un Joueur</h3>
        
        {error && <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

        <form onSubmit={handleAddPlayer} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Nom & Prénom</label>
            <input
              type="text"
              placeholder="ex: Lucas Martin"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-slate-200"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Points FFTT</label>
            <input
              type="number"
              value={playerPoints}
              onChange={(e) => setPlayerPoints(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200"
            />
          </div>

          {/* Sélection des Tableaux (Max 2) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">
              Choisir les tableaux (Max 2) :
            </label>
            <div className="space-y-2">
              {categories.map((cat) => {
                const count = cat.category_players?.[0]?.count || 0;
                const isFull = count >= 35;
                const isChecked = selectedCats.includes(cat.id);

                return (
                  <button
                    type="button"
                    key={cat.id}
                    disabled={isFull && !isChecked}
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={`w-full p-3 rounded-xl border text-left font-medium text-sm flex justify-between items-center transition-all ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    } ${isFull ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span>{cat.name}</span>
                    <span className="text-xs">{isFull ? 'COMPLET (35/35)' : `${count}/35`}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={selectedCats.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            Inscrire le joueur ({selectedCats.length}/2 tableaux)
          </button>
        </form>
      </div>

    </div>
  );
}