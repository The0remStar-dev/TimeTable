import { useMemo, useEffect, useState } from 'react';
import {
  Trophy,
  RefreshCw,
  Clock,
  CheckCircle2,
  Table,
  Zap,
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

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();
  if (['BUSY', 'EN COURS', 'PLAYING', 'OCCUPE'].includes(value)) return 'EN COURS';
  if (['FREE', 'DISPONIBLE', 'AVAILABLE', 'LIBRE'].includes(value)) return 'DISPONIBLE';
  return value || 'DISPONIBLE';
};

const getInitials = (name) => {
  if (!name) return '??';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

const getElapsedDisplay = (startedAt, now = Date.now()) => {
  if (!startedAt) return '00:00 min';
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return '00:00 min';
  const totalSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds} min`;
};

export default function DashboardPage({
  tables,
  queue,
  tableFilter,
  setTableFilter,
  activeTablesCount,
  freeTablesCount,
  playedMatchesCount,
  onAutoAssign,
  onAssignSpecificMatch,
  onOpenScore,
  onOpenAssign,
  onRefresh,
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredTables = useMemo(() => {
    if (tableFilter === 'active') return tables.filter((table) => normalizeStatus(table.status) === 'EN COURS');
    if (tableFilter === 'free') return tables.filter((table) => normalizeStatus(table.status) === 'DISPONIBLE');
    return tables;
  }, [tables, tableFilter]);

  return (
    <div className="flex gap-6 min-h-0">
      <main className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="grid grid-cols-4 gap-4 w-full">
          <StatCard title="Tables actives" value={`${activeTablesCount} / ${tables.length}`} subtitle="Sessions en cours" tone="bg-red-50 text-red-500" icon={Table} />
          <StatCard title="Blocs en file" value={queue.length} subtitle="À lancer" tone="bg-amber-50 text-amber-500" icon={Clock} />
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
              Lancer les prochains blocs
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
            const isActive = normalizeStatus(table.status) === 'EN COURS';
            const context = table.context;
            const activeMatch = context?.match;

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

                {activeMatch ? (
                  <>
                    <div className="flex items-center gap-1 text-red-600 font-bold text-sm my-1">
                      <span>⏱</span>
                      <span>{getElapsedDisplay(activeMatch.started_at, now)}</span>
                    </div>
                    <p className="text-slate-400 text-xs font-normal mb-3">{context.label} · {context.category}</p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(context.player1.name)}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{context.player1.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{context.score1 ?? 0} pts</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{getInitials(context.player2.name)}</div>
                          <span className="text-sm font-semibold text-slate-800 truncate">{context.player2.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{context.score2 ?? 0} pts</span>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Score</p>
                      <p className="text-lg font-black text-slate-900">{context.score}</p>
                    </div>

                    <button
                      onClick={() => onOpenScore({ ...table, context, match: activeMatch })}
                      className="w-full mt-3 bg-[#EF4444] hover:bg-red-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm"
                    >
                      <span>🏆</span>
                      Saisir le score
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 my-1">✦ TABLE LIBRE</p>
                    {queue[0] ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-500">{queue[0].label}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mb-2 mt-3">{queue[0].category}</p>
                        <button
                          onClick={() => onOpenAssign(table)}
                          className="w-full mt-2 bg-[#10B981] hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm"
                        >
                          <span>▷</span>
                          Assigner
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">Aucune table active — libérée automatiquement après fin de match.</p>
                    )}
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
          <span>Poules</span>
          <span>Arbre</span>
        </div>

        <div className="flex flex-col gap-3">
          {queue.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">Aucun bloc en file d'attente</div>
          ) : (
            queue.map((block) => (
              <div key={block.id} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex flex-col gap-2 relative">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md w-fit ${priorityClasses[block.priority || 'Low']}`}>
                  {block.type === 'poule' ? 'BLOC POULE' : 'TABLEAU FINAL'}
                </span>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-slate-800">{block.label}</span>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const freeTable = tables.find((table) => normalizeStatus(table.status) === 'DISPONIBLE');
                      if (freeTable) {
                        onAssignSpecificMatch(freeTable.id, block);
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
      </aside>
    </div>
  );
}
