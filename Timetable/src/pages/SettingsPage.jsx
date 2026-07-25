export default function SettingsPage({ settings, setSettings }) {
  return (
    <main className="flex-1 overflow-y-auto p-6 max-w-3xl bg-slate-50">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="font-bold text-slate-900 text-base border-b border-slate-200 pb-3">Configuration Générale</h3>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Nom du Tournoi</label>
            <input
              type="text"
              value={settings.tournamentName}
              onChange={(event) => setSettings({ ...settings, tournamentName: event.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Juge-Arbitre Principal</label>
            <input
              type="text"
              value={settings.referee}
              onChange={(event) => setSettings({ ...settings, referee: event.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nombre de Tables Renseignées</label>
              <input
                type="number"
                value={settings.totalTables}
                onChange={(event) => setSettings({ ...settings, totalTables: parseInt(event.target.value) || 10 })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Durée Moyenne d'un Match (min)</label>
              <input
                type="number"
                value={settings.avgMatchDuration}
                onChange={(event) => setSettings({ ...settings, avgMatchDuration: parseInt(event.target.value) || 20 })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={() => alert('Paramètres sauvegardés !')}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm transition-colors"
            >
              Sauvegarder les modifications
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
