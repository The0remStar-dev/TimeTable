import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes.');
}

// Création du client unique pour toute l'application
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Test de connexion direct uniquement en dev et sans bruit inutile
async function testConnection() {
  if (!supabaseUrl || !supabaseAnonKey) return;
  if (import.meta.env.PROD) return;

  console.log('🔄 Test de connexion à Supabase en cours...');

  const { error } = await supabase.from('tournaments').select('count', { count: 'exact' });

  if (error) {
    console.warn('⚠️ Supabase non prêt ou schéma non synchronisé :', error.message);
  } else {
    console.log('✅ SUPABASE EST PARFAITEMENT CONNECTÉ !');
  }
}

testConnection();