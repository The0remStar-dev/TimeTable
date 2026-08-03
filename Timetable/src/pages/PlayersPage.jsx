import { Search, Filter, Check, AlertCircle } from 'lucide-react';

const statusConfig = {
  in_poules: { label: 'En Poule', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  in_bracket: { label: 'En 16ème', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  eliminated: { label: 'Éliminé', className: 'bg-red-100 text-red-700 border-red-200' },
  winner: { label: 'Vainqueur', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  playing: { label: 'En cours', className: 'bg-violet-100 text-violet-700 border-violet-200' },
};

export default function PlayersPage({ players, playerSearch, setPlayerSearch, playerCatFilter, setPlayerCatFilter }) {
  const filteredPlayers = players.filter((player) => {
    const playerName = String(player.name || '').toLowerCase();
    const clubName = String(player.club || '').toLowerCase();
    const matchesSearch =
      playerName.includes(playerSearch.toLowerCase()) ||
      clubName.includes(playerSearch.toLowerCase());
    const matchesCat = playerCatFilter === 'Tous' || player.category === playerCatFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Rechercher un joueur ou un club..."
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={playerCatFilter}
              onChange={(event) => setPlayerCatFilter(event.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="Tous">Toutes les catégories</option>
              <option value="Open A">Open A</option>
              <option value="Open B">Open B</option>
              <option value="Dames">Dames</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-y border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="py-3 px-4">Nom Joueur</th>
                <th className="py-3 px-4">Club</th>
                <th className="py-3 px-4 text-center">Points FFTT</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-center">Paiement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPlayers.map((player) => {
                const status = statusConfig[player.status] || { label: 'En Poule', className: 'bg-blue-100 text-blue-700 border-blue-200' };
                return (
                  <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{player.name}</td>
                    <td className="py-3 px-4 text-slate-600">{player.club || player.category || '—'}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{Number(player.fftt_points ?? player.points ?? player.pts ?? 0)} pts</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center border px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {player.paid ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                          <Check className="w-3 h-3" /> Payé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                          <AlertCircle className="w-3 h-3" /> En attente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
