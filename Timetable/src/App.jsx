import { useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';

import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import PoulesPage from './pages/PoulesPage';
import PlayersPage from './pages/PlayersPage';
import PaymentsPage from './pages/PaymentsPage';
import SettingsPage from './pages/SettingsPage';
import ManageTournament from './pages/ManageTournament';
import { useTournament } from './contexts/TournamentContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tableFilter, setTableFilter] = useState('all');
  const [playedMatchesCount, setPlayedMatchesCount] = useState(0);
  const [queue, setQueue] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerCatFilter, setPlayerCatFilter] = useState('Tous');
  const [settings, setSettings] = useState({
    tournamentName: 'Open de Tennis de Table 2026',
    referee: 'Jean-Marc Vallet (JA3)',
    totalTables: 10,
    avgMatchDuration: 25,
    matchFormat: '3_SETS_GAGNANTS'
  });
  const [tables, setTables] = useState([]);
  const [scoreModalTable, setScoreModalTable] = useState(null);
  const [scores, setScores] = useState(Array.from({ length: 5 }).map(() => ({ p1: '', p2: '' })));
  const [assignModalTable, setAssignModalTable] = useState(null);
  const [matches, setMatches] = useState([]);
  const tournament = useTournament();
  const {
    players: ctxPlayers,
    matches: ctxMatches,
    tables: ctxTables,
    assignMatchToTable,
    autoAssignMatches,
    completeMatch
  } = tournament || {};

  // derive played matches count from matches fetched from Supabase
  useEffect(() => {
    if (!matches) return;
    const played = matches.filter((m) => m.status && ['played', 'finished', 'completed'].includes(String(m.status).toLowerCase()));
    setPlayedMatchesCount(played.length);
  }, [matches]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTables((currentTables) =>
        currentTables.map((table) => {
          if (table.status === 'EN COURS' && table.match) {
            return {
              ...table,
              match: {
                ...table.match,
                elapsedSeconds: table.match.elapsedSeconds + 1
              }
            };
          }
          return table;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // derive queue from matches + players
  useEffect(() => {
    if (!matches || matches.length === 0) return;
    const toQueue = matches
      .filter((m) => m.status && String(m.status).toLowerCase() === 'scheduled')
      .sort((a, b) => new Date(a.scheduled_at || a.created_at) - new Date(b.scheduled_at || b.created_at))
      .map((m) => {
        const findPlayer = (idKey) => players.find((p) => p.id === m[idKey] || p.id === m.player1_id || p.id === m.player_id);
        const p1 = players.find((p) => p.id === m.p1_id || p.id === m.player1_id) || { name: m.p1_name || 'Joueur A', points: m.p1_points || 0 };
        const p2 = players.find((p) => p.id === m.p2_id || p.id === m.player2_id) || { name: m.p2_name || 'Joueur B', points: m.p2_points || 0 };

        return {
          id: m.id,
          p1,
          p2,
          category: m.category_name || m.category || 'Catégorie',
          priority: m.priority || 'Low',
          estWait: m.estimated_wait || '00:00'
        };
      });

    if (toQueue.length > 0) setQueue(toQueue);
  }, [matches, players]);

  // sync local UI state when context updates
  useEffect(() => {
    if (ctxPlayers) setPlayers(ctxPlayers);
  }, [ctxPlayers]);

  useEffect(() => {
    if (ctxMatches) setMatches(ctxMatches);
  }, [ctxMatches]);

  useEffect(() => {
    if (ctxTables) setTables(ctxTables);
  }, [ctxTables]);

  const activeTablesCount = useMemo(
    () => tables.filter((table) => table.status === 'EN COURS').length,
    [tables]
  );

  const freeTablesCount = useMemo(
    () => tables.filter((table) => table.status === 'DISPONIBLE').length,
    [tables]
  );

  const handleAutoAssign = () => {
    if (autoAssignMatches) autoAssignMatches();
  };

  const handleAssignSpecificMatch = (tableId, match) => {
    if (assignMatchToTable) {
      assignMatchToTable(match.id, tableId);
    }
    setAssignModalTable(null);
  };

  const handleSaveScore = () => {
    if (!scoreModalTable) return;
    // call context to complete the match
    if (completeMatch && scoreModalTable.match) {
      const matchId = scoreModalTable.match.id;
      const tableId = scoreModalTable.id;
      const scoreStr = scores.map((s) => `${s.p1 || 0}-${s.p2 || 0}`).join(',');
      completeMatch(matchId, scoreStr, tableId).then(() => {
        setScoreModalTable(null);
        setScores(Array.from({ length: 5 }).map(() => ({ p1: '', p2: '' })));
      });
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans antialiased overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        refereeName={settings.referee}
        tournamentName={settings.tournamentName}
      />

      <div className="flex-1 flex flex-col overflow-y-auto p-8 gap-6">
        {activeTab === 'dashboard' && (
          <DashboardPage
            tables={tables}
            queue={queue}
            settings={settings}
            tableFilter={tableFilter}
            setTableFilter={setTableFilter}
            activeTablesCount={activeTablesCount}
            freeTablesCount={freeTablesCount}
            playedMatchesCount={playedMatchesCount}
            players={players}
            onAutoAssign={handleAutoAssign}
            onAssignSpecificMatch={handleAssignSpecificMatch}
            onOpenScore={setScoreModalTable}
            onOpenAssign={setAssignModalTable}
            onRefresh={() => setTables([...tables])}
          />
        )}

        {activeTab === 'poules' && (
          <div className="flex-1 overflow-y-auto">
            <ManageTournament />
          </div>
        )}

        {activeTab === 'joueurs' && (
          <PlayersPage
            players={players}
            playerSearch={playerSearch}
            setPlayerSearch={setPlayerSearch}
            playerCatFilter={playerCatFilter}
            setPlayerCatFilter={setPlayerCatFilter}
          />
        )}

        {activeTab === 'paiements' && <PaymentsPage players={players} setPlayers={setPlayers} />}

        {activeTab === 'parametres' && <SettingsPage settings={settings} setSettings={setSettings} />}
      </div>

      {scoreModalTable && scoreModalTable.match && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Saisie du Score - {scoreModalTable.name}</h3>
                <p className="text-[11px] text-slate-400">{scoreModalTable.match.category}</p>
              </div>
              <button onClick={() => setScoreModalTable(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="font-bold text-xs text-slate-800">{scoreModalTable.match.p1.name}</p>
                  <p className="text-[10px] text-slate-500">{scoreModalTable.match.p1.club}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="font-bold text-xs text-blue-900">{scoreModalTable.match.p2.name}</p>
                  <p className="text-[10px] text-blue-700">{scoreModalTable.match.p2.club}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Scores par manche</p>
                {scores.map((set, idx) => (
                  <div key={idx} className="flex items-center justify-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-12 text-right">Set {idx + 1}</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={set.p1}
                      onChange={(event) => {
                        const nextScores = [...scores];
                        nextScores[idx].p1 = event.target.value;
                        setScores(nextScores);
                      }}
                      className="w-14 p-2 border border-slate-200 rounded-lg text-center font-bold text-slate-800 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-slate-300 font-bold">-</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={set.p2}
                      onChange={(event) => {
                        const nextScores = [...scores];
                        nextScores[idx].p2 = event.target.value;
                        setScores(nextScores);
                      }}
                      className="w-14 p-2 border border-slate-200 rounded-lg text-center font-bold text-slate-800 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => setScoreModalTable(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveScore}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
                >
                  Valider et Libérer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {assignModalTable && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm">Assigner un match à la {assignModalTable.name}</h3>
              <button onClick={() => setAssignModalTable(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <p className="text-xs font-medium text-slate-500 mb-2">Choisissez le match à lancer :</p>
              {queue.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Aucun match disponible en file d'attente</p>
              ) : (
                queue.map((match) => (
                  <div
                    key={match.id}
                    className="p-3 border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/40 transition-all flex justify-between items-center text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800">
                        {match.p1.name} vs {match.p2.name}
                      </p>
                      <p className="text-[10px] text-slate-500">{match.category}</p>
                    </div>
                    <button
                      onClick={() => handleAssignSpecificMatch(assignModalTable.id, match)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors"
                    >
                      Lancer ici
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

