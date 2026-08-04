import { useMemo, useState, useEffect } from 'react';
import { X } from 'lucide-react';

import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import PaymentsPage from './pages/PaymentsPage';
import SettingsPage from './pages/SettingsPage';
import ManageTournament from './pages/ManageTournament';
import { useTournament } from './contexts/TournamentContext';

const normalizeTableStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();
  if (['BUSY', 'EN COURS', 'PLAYING', 'OCCUPE'].includes(value)) return 'EN COURS';
  if (['FREE', 'DISPONIBLE', 'AVAILABLE', 'LIBRE'].includes(value)) return 'DISPONIBLE';
  return value || 'DISPONIBLE';
};

const getPlayerName = (player) => player?.full_name || player?.name || 'Joueur inconnu';
const getPlayerById = (playerId, players) => players.find((player) => player.id === playerId);

const buildPouleQueue = (matches, players, categories = []) => {
  const byPoule = new Map();
  matches.forEach((match) => {
    if (match.round_type !== 'poule' || !match.poule_id) return;
    const categoryName = categories.find((cat) => cat.id === match.category_id)?.name || 'Tableau principal';
    if (!byPoule.has(match.poule_id)) {
      byPoule.set(match.poule_id, {
        id: match.poule_id,
        type: 'poule',
        label: `Poule ${String(match.poule_id).slice(0, 4)}`,
        category: categoryName,
        matchIds: [],
        players: [],
      });
    }

    const entry = byPoule.get(match.poule_id);
    entry.matchIds.push(match.id);
    entry.category = categoryName;
    const p1 = getPlayerById(match.player1_id, players);
    const p2 = getPlayerById(match.player2_id, players);
    if (p1) entry.players.push(p1.id);
    if (p2) entry.players.push(p2.id);
  });

  return Array.from(byPoule.values()).map((entry) => ({
    ...entry,
    players: [...new Set(entry.players)],
    matchCount: entry.matchIds.length,
    label: `${entry.label} - ${entry.matchCount} matchs`,
  }));
};

const buildBracketQueue = (matches, players) =>
  matches
    .filter((match) => match.round_type !== 'poule' && match.status === 'scheduled')
    .map((match) => {
      const p1 = getPlayerById(match.player1_id, players);
      const p2 = getPlayerById(match.player2_id, players);
      return {
        id: match.id,
        type: 'bracket',
        label: `${match.round_type || 'Tour'} · ${getPlayerName(p1)} vs ${getPlayerName(p2)}`,
        category: 'Tableau final',
        players: [match.player1_id, match.player2_id].filter(Boolean),
        matchId: match.id,
      };
    });

const parseScoreNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatScore = (match) => {
  if (match?.score && typeof match.score === 'string' && match.score.includes('-')) {
    return match.score;
  }

  const score1 = parseScoreNumber(match?.score1);
  const score2 = parseScoreNumber(match?.score2);
  if (score1 !== null || score2 !== null) {
    return `${score1 ?? 0}-${score2 ?? 0}`;
  }
  return 'Score non saisi';
};

const buildTableContext = (table, matches, players) => {
  const assignedMatches = matches
    .filter((match) => match.table_id === table.id)
    .filter((match) => ['playing', 'completed', 'scheduled'].includes(String(match.status || '').toLowerCase()))
    .sort((a, b) => new Date(b.started_at || b.created_at || 0) - new Date(a.started_at || a.created_at || 0));

  const match = assignedMatches[0];
  if (!match) return null;

  const player1 = getPlayerById(match.player1_id, players) || { id: match.player1_id, name: 'Joueur 1' };
  const player2 = getPlayerById(match.player2_id, players) || { id: match.player2_id, name: 'Joueur 2' };
  const status = String(match.status || '').toLowerCase();

  return {
    type: 'match',
    match,
    label:
      match.round_type === 'poule'
        ? `Poule ${String(match.poule_id || 'active').slice(0, 4)}`
        : match.round_type || 'Match',
    category: match.category_name || match.category || 'Tableau principal',
    roundLabel: match.round_type || 'Match',
    player1: { ...player1, name: getPlayerName(player1) },
    player2: { ...player2, name: getPlayerName(player2) },
    score: formatScore(match),
    score1: parseScoreNumber(match.score1),
    score2: parseScoreNumber(match.score2),
    startedAt: match.started_at || null,
    finishedAt: match.finished_at || null,
    status:
      status === 'completed'
        ? 'Terminé'
        : status === 'playing'
          ? 'Match actif'
          : 'Programmé',
    tableStatus: normalizeTableStatus(table.status),
  };
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tableFilter, setTableFilter] = useState('all');
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerCatFilter, setPlayerCatFilter] = useState('Tous');
  const [selectedCategoryId] = useState(null);
  const [settings, setSettings] = useState({
    tournamentName: 'Open de Tennis de Table 2026',
    referee: 'Jean-Marc Vallet (JA3)',
    totalTables: 10,
    avgMatchDuration: 25,
    matchFormat: '3_SETS_GAGNANTS'
  });
  const [scoreModalTable, setScoreModalTable] = useState(null);
  const [scores, setScores] = useState(Array.from({ length: 5 }).map(() => ({ p1: '', p2: '' })));
  const [assignModalTable, setAssignModalTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [toast, setToast] = useState(null);
  const tournament = useTournament();
  const {
    players: ctxPlayers,
    matches: ctxMatches,
    tables: ctxTables,
    categories: ctxCategories,
    assignMatchToTable,
    autoAssignMatches,
    completeMatch,
    assignPouleToTable,
    submitPouleMatchResult,
    updatePlayerPaymentStatus,
    deletePlayerById,
  } = tournament || {};

  const matches = useMemo(() => ctxMatches ?? [], [ctxMatches]);
  const derivedPlayers = useMemo(() => ctxPlayers ?? players, [ctxPlayers, players]);
  const tablesFromContext = useMemo(
    () =>
      (ctxTables ?? []).map((table) => ({
        ...table,
        status: normalizeTableStatus(table.status),
        context: buildTableContext(table, matches, derivedPlayers),
      })),
    [ctxTables, matches, derivedPlayers]
  );
  const tablesWithState = tables.length ? tables : tablesFromContext;
  const playersWithState = ctxPlayers ?? players;
  const playedMatchesCount = useMemo(
    () => matches.filter((match) => match.status && ['played', 'finished', 'completed'].includes(String(match.status).toLowerCase())).length,
    [matches]
  );
  const queue = useMemo(() => {
    if (!matches.length || !playersWithState.length) return [];
    const scheduled = matches.filter((match) => String(match.status || '').toLowerCase() === 'scheduled');
    return [...buildPouleQueue(scheduled, playersWithState, ctxCategories || []), ...buildBracketQueue(scheduled, playersWithState)].sort((a) => (a.type === 'poule' ? -1 : 1));
  }, [matches, playersWithState, ctxCategories]);

  const activeTablesCount = useMemo(
    () => tablesWithState.filter((table) => normalizeTableStatus(table.status) === 'EN COURS').length,
    [tablesWithState]
  );

  const freeTablesCount = useMemo(
    () => tablesWithState.filter((table) => normalizeTableStatus(table.status) === 'DISPONIBLE').length,
    [tablesWithState]
  );

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const notify = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleAutoAssign = async () => {
    try {
      if (!autoAssignMatches) return;
      const result = await autoAssignMatches();
      if (result?.assigned?.length) {
        notify(`${result.assigned.length} match(s) assigné(s) à une table`, 'success');
      } else if (result?.reason === 'empty_queue') {
        notify('Aucun match programmé dans la file d’attente', 'info');
      } else if (result?.reason === 'no_free_tables') {
        notify('Aucune table libre pour lancer un match', 'warning');
      }
    } catch (error) {
      console.error('[App] Erreur autoAssignMatches', error);
      notify(error.message || 'Erreur lors de l’assignation automatique', 'error');
    }
  };

  const togglePlayerPayment = async (playerId, paid) => {
    if (!updatePlayerPaymentStatus) return;
    const result = await updatePlayerPaymentStatus(playerId, paid);
    if (!result.success) {
      console.error('Erreur mise à jour paiement', result.error);
    }
  };

  const deletePlayer = async (playerId) => {
    if (!deletePlayerById) return;
    const result = await deletePlayerById(playerId);
    if (!result.success) {
      console.error('Erreur suppression joueur', result.error);
    }
  };

  const handleAssignSpecificMatch = async (tableId, block) => {
    try {
      console.log('[App] Assignation bloc', { tableId, block });
      if (block?.type === 'poule' && block?.id) {
        if (assignPouleToTable) await assignPouleToTable(block.id, tableId);
      } else if (block?.matchId && assignMatchToTable) {
        await assignMatchToTable(block.matchId, tableId);
      }
      notify('Bloc assigné à la table avec succès', 'success');
      setAssignModalTable(null);
    } catch (error) {
      console.error('[App] Assignment failed', error);
      notify(error.message || 'Erreur d’assignation à la table', 'error');
    }
  };

  const handleSaveScore = async () => {
    if (!scoreModalTable) return;

    try {
      const activeMatch = scoreModalTable.context?.match || scoreModalTable.match;

      if (scoreModalTable.context?.type === 'match' && activeMatch && submitPouleMatchResult) {
        const score = scores.find((set) => Number(set.p1 || 0) > 0 || Number(set.p2 || 0) > 0) || { p1: 0, p2: 0 };
        const p1 = Number(score.p1 || 0);
        const p2 = Number(score.p2 || 0);
        const winnerId = p1 > p2 ? activeMatch.player1_id : p2 > p1 ? activeMatch.player2_id : null;
        console.log('[App] Validation score poule', { matchId: activeMatch.id, p1, p2, winnerId });
        await submitPouleMatchResult(activeMatch.id, p1, p2, winnerId || undefined);
        notify('Score enregistré, la poule continue ou se termine proprement', 'success');
      } else if (activeMatch && completeMatch) {
        const tableId = scoreModalTable.id;
        const scoreStr = scores.map((set) => `${set.p1 || 0}-${set.p2 || 0}`).join(',');
        console.log('[App] Validation score tableau final', { matchId: activeMatch.id, scoreStr, tableId });
        await completeMatch(activeMatch.id, scoreStr, tableId);
        notify('Match terminé et table libérée', 'success');
      }

      setScoreModalTable(null);
      setScores(Array.from({ length: 5 }).map(() => ({ p1: '', p2: '' })));
    } catch (error) {
      console.error('[App] Score save failed', error);
      notify(error.message || 'Erreur lors de la validation du score', 'error');
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans antialiased overflow-hidden">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] rounded-xl border px-4 py-3 shadow-lg text-sm font-semibold text-white bg-slate-900">
          {toast.message}
        </div>
      )}
      <Sidebar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        refereeName={settings.referee}
        tournamentName={settings.tournamentName}
      />

      <div className="flex-1 flex flex-col overflow-y-auto p-8 gap-6">
        {activeTab === 'dashboard' && (
          <DashboardPage
            tables={tablesWithState}
            queue={queue}
            tableFilter={tableFilter}
            setTableFilter={setTableFilter}
            activeTablesCount={activeTablesCount}
            freeTablesCount={freeTablesCount}
            playedMatchesCount={playedMatchesCount}
            onAutoAssign={handleAutoAssign}
            onAssignSpecificMatch={handleAssignSpecificMatch}
            onOpenScore={setScoreModalTable}
            onOpenAssign={setAssignModalTable}
            onRefresh={() => setTables([...tablesWithState])}
          />
        )}

        {activeTab === 'poules' && (
          <div className="flex-1 overflow-y-auto">
            <ManageTournament />
          </div>
        )}

        {activeTab === 'joueurs' && (
          <PlayersPage
            players={playersWithState}
            playerSearch={playerSearch}
            setPlayerSearch={setPlayerSearch}
            playerCatFilter={playerCatFilter}
            setPlayerCatFilter={setPlayerCatFilter}
            selectedCategoryId={selectedCategoryId}
            onTogglePayment={togglePlayerPayment}
            onDeletePlayer={deletePlayer}
            categories={ctxCategories || []}
          />
        )}

        {activeTab === 'paiements' && <PaymentsPage players={playersWithState} setPlayers={setPlayers} />}

        {activeTab === 'parametres' && <SettingsPage settings={settings} setSettings={setSettings} />}
      </div>

      {scoreModalTable && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Saisie du Score - {scoreModalTable.name}</h3>
                <p className="text-[11px] text-slate-400">{scoreModalTable.context?.label || scoreModalTable.match?.category || 'Match'}</p>
              </div>
              <button onClick={() => setScoreModalTable(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {scoreModalTable.context?.type === 'poule' ? (
                <div className="space-y-3">
                  {scoreModalTable.context.matches.map((match) => (
                    <div key={match.id} className="p-3 border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-500">{match.label}</p>
                      <p className="text-sm font-semibold text-slate-800">{match.p1} vs {match.p2}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="font-bold text-xs text-slate-800">{scoreModalTable.context?.p1 || scoreModalTable.match?.p1?.name}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="font-bold text-xs text-blue-900">{scoreModalTable.context?.p2 || scoreModalTable.match?.p2?.name}</p>
                  </div>
                </div>
              )}

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
              <h3 className="font-bold text-sm">Assigner un bloc à la {assignModalTable.name}</h3>
              <button onClick={() => setAssignModalTable(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <p className="text-xs font-medium text-slate-500 mb-2">Choisissez le bloc à lancer :</p>
              {queue.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Aucun bloc disponible en file d'attente</p>
              ) : (
                queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/40 transition-all flex justify-between items-center text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800">{item.label}</p>
                      <p className="text-[10px] text-slate-500">{item.category}</p>
                    </div>
                    <button
                      onClick={() => handleAssignSpecificMatch(assignModalTable.id, item)}
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

