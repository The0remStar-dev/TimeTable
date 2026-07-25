export default function PaymentsPage({ players, setPlayers }) {
  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">Total Collecté</p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">140 €</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">En Attente de Règlement</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">30 €</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">Taux de Règlement</p>
          <p className="text-3xl font-bold text-sky-600 mt-2">82 %</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Suivi des règlements d'inscription (10€ / joueur)</h3>
        <div className="divide-y divide-slate-200">
          {players.map((player) => (
            <div key={player.id} className="py-3 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-slate-900">{player.name}</p>
                <p className="text-slate-500 text-[11px]">{player.club}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-slate-700">10.00 €</span>
                <button
                  onClick={() => {
                    setPlayers((currentPlayers) =>
                      currentPlayers.map((item) => (item.id === player.id ? { ...item, paid: !item.paid } : item))
                    );
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    player.paid
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {player.paid ? 'Réglé' : 'Marquer Réglé'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
