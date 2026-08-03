import { useState, useEffect } from 'react';
import { useTournament } from '../contexts/TournamentContext';

export default function ManageTournament() {
  const { currentTournament, categories, addCategory, addPlayerWithCategories, loadAll, createTournament } = useTournament();
  const [newTournamentName, setNewTournamentName] = useState('Mon Tournoi');
  const [catName, setCatName] = useState('');
  const [catTime, setCatTime] = useState('');
  
  // Champs joueur
  const [playerName, setPlayerName] = useState('');
  const [playerPoints, setPlayerPoints] = useState(500);
  const [selectedCats, setSelectedCats] = useState([]);
  const [error, setError] = useState(null);

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
              return (
                <div key={cat.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">{cat.name}</p>
                    <p className="text-xs text-slate-400">Début : {new Date(cat.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${count >= 35 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {count} / 35 joueurs
                  </span>
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