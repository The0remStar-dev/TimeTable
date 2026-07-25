import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Création du client unique pour toute l'application
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test de connexion direct
async function testConnection() {
  console.log("🔄 Test de connexion à Supabase en cours...");
  
  // Requête ultra-simple pour interroger la base
  const { data, error } = await supabase.from('tournaments').select('count', { count: 'exact' });

  if (error) {
    console.error("❌ ÉCHEC DE CONNEXION :", error.message);
  } else {
    console.log("✅ SUPABASE EST PARFAITEMENT CONNECTÉ !");
  }
}

testConnection();