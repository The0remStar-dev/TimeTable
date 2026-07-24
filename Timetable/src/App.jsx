import { useEffect, useState } from 'react';
import { supabase } from './services/supabaseClient';

export default function App() {
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    // 1. Récupérer les tournois existants au chargement
    const fetchTournaments = async () => {
      const { data } = await supabase.from('tournaments').select('*');
      if (data) setTournaments(data);
    };
    fetchTournaments();

    // 2. ÉCOUTER EN TEMPS RÉEL (La magie de ton app)
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        (payload) => {
          console.log('Changement détecté en direct !', payload);
          fetchTournaments(); // Re-télécharge la liste dès que la DB change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">🏓 Ping Fluid - Test Supabase</h1>
      {tournaments.length === 0 ? (
        <p className="text-gray-400">Aucun tournoi en base. Ajoutes-en un sur Supabase pour voir le direct !</p>
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t) => (
            <li key={t.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              {t.name} - <span className="text-green-400">{t.code}</span> ({t.status})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}