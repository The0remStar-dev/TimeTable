export default function PoulesPage() {
  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
          <h3 className="text-lg font-bold text-slate-900">Poules - Open A</h3>
          <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full">
            Phase 1 en cours
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['Poule A', 'Poule B', 'Poule C'].map((pouleName) => (
            <div key={pouleName} className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">{pouleName}</h4>
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-100 uppercase text-[10px] text-slate-500">
                  <tr>
                    <th className="p-2">Joueur</th>
                    <th className="p-2 text-center">Vic.</th>
                    <th className="p-2 text-center">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  <tr>
                    <td className="p-2 font-semibold text-slate-900">Lucas Martin</td>
                    <td className="p-2 text-center font-bold text-emerald-700">3</td>
                    <td className="p-2 text-center text-slate-700">6</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-900">Alexandre Dubois</td>
                    <td className="p-2 text-center text-slate-700">2</td>
                    <td className="p-2 text-center text-slate-700">5</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-900">Julien Blanc</td>
                    <td className="p-2 text-center text-slate-400">0</td>
                    <td className="p-2 text-center text-slate-700">3</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Tableau Final - Élimination Directe</h3>
          <div className="flex gap-6 overflow-x-auto pb-4">
            <div className="w-56 space-y-4 shrink-0">
              <p className="text-xs font-bold text-slate-500 uppercase">1/4 Finale</p>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1 shadow-sm">
                <p className="font-bold text-slate-900">T. Leroy (1620)</p>
                <p className="text-slate-500">M. Moreau (1590)</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1 shadow-sm">
                <p className="font-bold text-slate-900">L. Martin (1540)</p>
                <p className="text-slate-500">A. Dubois (1485)</p>
              </div>
            </div>
            <div className="w-56 space-y-4 shrink-0 justify-center flex flex-col">
              <p className="text-xs font-bold text-slate-500 uppercase">1/2 Finale</p>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1 shadow-sm">
                <p className="font-bold text-slate-900">TBD</p>
                <p className="text-slate-400">TBD</p>
              </div>
            </div>
            <div className="w-56 space-y-4 shrink-0 justify-center flex flex-col">
              <p className="text-xs font-bold text-slate-500 uppercase">Finale</p>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs space-y-1 shadow-sm">
                <p className="font-bold text-sky-900">Vainqueur A</p>
                <p className="text-sky-700">Vainqueur B</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
