import {
  LayoutDashboard,
  Table,
  Users,
  CreditCard,
  Settings,
  Shield,
  Trophy
} from 'lucide-react';

export default function Sidebar({ activeTab, onChangeTab, refereeName, tournamentName }) {
  const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'poules', label: 'Tableaux / Poules', icon: Table },
    { id: 'joueurs', label: 'Joueurs', icon: Users },
    { id: 'paiements', label: 'Paiements', icon: CreditCard },
    { id: 'parametres', label: 'Paramètres', icon: Settings }
  ];

  return (
    <aside className="w-64 bg-[#0F172A] text-white flex flex-col justify-between p-4 shrink-0">
      <div>
        <div className="mb-6">
          <h1 className="font-bold text-white text-lg">TT Admin</h1>
          <span className="text-[10px] font-bold text-slate-400 tracking-[0.18em]">JUGE-ARBITRE</span>
        </div>

        <div className="bg-slate-800 rounded-xl p-3 mb-6">
          <p className="text-sm font-semibold text-white">{tournamentName}</p>
          <p className="text-emerald-400 text-xs font-bold mt-1">● EN COURS</p>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </span>
                {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
        <div className="bg-slate-800 text-slate-200 w-10 h-10 rounded-full font-bold flex items-center justify-center">JA</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">Jean Arbitre</p>
          <p className="text-[11px] text-slate-400">Juge-Arbitre Principal</p>
        </div>
      </div>
    </aside>
  );
}
