import { useMemo } from 'react';
import {
  Trophy,
  RefreshCw,
  Clock,
  CheckCircle2,
  Table,
  Zap,
  Plus,
  ArrowRight
} from 'lucide-react';

const priorityClasses = {
  High: 'bg-red-50 text-red-700 border-red-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200'
};

function StatCard({ title, value, subtitle, tone, icon: Icon }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`p-3 rounded-xl border ${tone}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage({
  tables,
  queue,
  settings,
  tableFilter,
  setTableFilter,
  activeTablesCount,
  freeTablesCount,
  playedMatchesCount,
  players,
  onAutoAssign,
  onAssignSpecificMatch,
  onOpenScore,
  onOpenAssign,
  onRefresh
}) {
  const filteredTables = useMemo(() => {
    if (tableFilter === 'active') return tables.filter((table) => table.status === 'EN COURS');
    if (tableFilter === 'free') return tables.filter((table) => table.status === 'DISPONIBLE');
    return tables;
  }, [tables, tableFilter]);

  const getInitials = (name) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  };

  const formatTimer = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex gap-6 min-h-0">
      <main className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="grid grid-cols-4 gap-4 w-full">
          <StatCard title="Tables actives" value={`${activeTablesCount} / ${tables.length}`} subtitle="Sessions en cours" tone="bg-red-50 text-red-500" icon={Table} />
          <StatCard title="Matchs en file" value={queue.length} subtitle="À lancer" tone="bg-amber-50 text-amber-500" icon={Clock} />
          <StatCard title="Matchs joués" value={playedMatchesCount} subtitle="Validés aujourd'hui" tone="bg-emerald-50 text-emerald-500" icon={Trophy} />
          <StatCard title="Tables libres" value={freeTablesCount} subtitle="Prêtes à servir" tone="bg-blue-50 text-blue-500" icon={CheckCircle2} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onRefresh} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </button>
            <button
              onClick={onAutoAssign}
              disabled={freeTablesCount === 0 || queue.length === 0}
              className="bg-[#10B981] hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm flex items-center gap-2"
            >
              <Zap className="w-4 h-4 fill-current" />
              Lancer les prochains matchs
              <span className="bg-emerald-800/40 text-white text-xs px-2 py-0.5 rounded-full">{Math.min(freeTablesCount, queue.length)}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Vue des Tables</h2>
            <p className="text-slate-400 text-sm">{activeTablesCount} en cours · {freeTablesCount} disponibles · {tables.length} total</p>
          </div>

          <div className="flex items-center gap-2">
            {[
              { id: 'all', label: 'Toutes' },
              { id: 'active', label: 'En cours' },
              { id: 'free', label: 'Libres' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setTableFilter(filter.id)}
                className={`text-xs px-3 py-1.5 rounded-lg ${
                  tableFilter === filter.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {filteredTables.map((table) => {
            const isActive = table.status === 'EN COURS';

            return (
              <div
                key={table.id}
                className={`relative flex flex-col justify-between rounded-2xl p-4 shadow-sm border-2 ${
                  isActive
                    ? 'bg-white border-red-200 hover:border-red-300'
                    : 'bg-[#F0FDF4] border-[#DCFCE7] hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase">{table.name}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isActive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isActive ? '● EN COURS' : '● DISPONIBLE'}
                  </span>
                </div>

                {isActive && table.match ? (
                  <>
                    <div className="flex items-center gap-1 text-red-600 font-bold text-sm my-1">
                      <span>⏱</span>
                      <span>{formatTimer(table.match.elapsedSeconds)}</span>
                    </div>
                    <p className="text-slate-400 text-xs font-normal mb-3">{table.match.category}</p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(table.match.p1.name)}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{table.match.p1.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{table.match.p1.points} pts</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(table.match.p2.name)}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{table.match.p2.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{table.match.p2.points} pts</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenScore(table)}
                      className="w-full mt-3 bg-[#EF4444] hover:bg-red-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm"
                    >
                      <span>🏆</span>
                      Saisir le Score
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 my-1">✦ MATCH SUGGÉRÉ</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(queue[0]?.p1?.name || 'A')}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{queue[0]?.p1?.name || 'Joueur A'}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{queue[0]?.p1?.points || 1320} pts</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(queue[0]?.p2?.name || 'B')}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{queue[0]?.p2?.name || 'Joueur B'}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{queue[0]?.p2?.points || 1400} pts</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mb-2 mt-3">Poule B · R3 · Cat. &lt; 1200</p>
                    <button
                      onClick={() => onOpenAssign(table)}
                      className="w-full mt-2 bg-[#10B981] hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm"
                    >
                      <span>▷</span>
                      Assigner le Match
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <aside className="w-80 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">File d'Attente</h3>
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{queue.length}</span>
        </div>

        <div className="flex gap-2 text-[10px] text-slate-400 font-medium mb-1">
          <span>Haute</span>
          <span>Moy.</span>
          <span>Basse</span>
        </div>

        <div className="flex flex-col gap-3">
          {queue.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">Aucun match en file d'attente</div>
          ) : (
            queue.map((match, idx) => (
              <div key={match.id} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col gap-2 relative">
                <div className="absolute right-3 top-3 text-xs text-slate-400 flex items-center gap-1">⏱ {match.estWait}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md w-fit ${priorityClasses[match.priority]}`}>
                  {match.priority === 'High' ? 'PRIORITÉ HAUTE' : match.priority === 'Medium' ? 'PRIORITÉ MOY.' : 'PRIORITÉ BASSE'}
                </span>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-slate-800">{match.p1.name}</span>
                  <span className="text-[10px] font-extrabold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">VS</span>
                  <span className="text-sm font-bold text-slate-800">{match.p2.name}</span>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const freeTable = tables.find((table) => table.status === 'DISPONIBLE');
                      if (freeTable) {
                        onAssignSpecificMatch(freeTable.id, match);
                      } else {
                        onOpenAssign(tables[0]);
                      }
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors"
                  >
                    Assigner -&gt;
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-200 pt-3">
          <span>Total joueurs: {players.length}</span>
          <span>Joués: {playedMatchesCount}</span>
          <span>Restants: {players.length - playedMatchesCount}</span>
        </div>
      </aside>
    </div>
  );
}
