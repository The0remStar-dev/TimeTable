import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env (simple parser)
const envPath = new URL('../.env', import.meta.url);
let env = {};
try {
  const txt = fs.readFileSync(envPath, 'utf8');
  txt.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=\s*(.*)\s*$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
} catch (e) {
  console.error('Could not read .env:', e.message);
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('Testing Supabase connection...');
  try {
    const { data: tournament, error: tErr } = await supabase.from('tournaments').select('id').limit(1).maybeSingle();
    if (tErr) {
      console.error('Error fetching tournament:', tErr.message || tErr);
      process.exit(1);
    }
    console.log('Tournament id fetched:', tournament?.id, 'type:', typeof tournament?.id);

    let tid = tournament?.id;
    if (!tid) {
      console.log('No tournament found — creating a test tournament...');
      const generatedCode = Math.random().toString(36).slice(2,8).toUpperCase();
      const { data: created, error: createErr } = await supabase.from('tournaments').insert([{ name: 'Test Tournament (script)', status: 'draft', code: generatedCode }]).select().maybeSingle();
      if (createErr) {
        console.error('Error creating test tournament:', createErr.message || createErr);
        process.exit(1);
      }
      tid = created?.id;
      console.log('Created tournament id:', tid);
    }

    // fetch categories
    const { data: cats, error: cErr } = await supabase.from('categories').select('*').eq('tournament_id', tid);
    if (cErr) {
      console.error('Error fetching categories for tournament:', cErr.message || cErr);
      process.exit(1);
    }
    console.log('Categories count:', Array.isArray(cats) ? cats.length : 0);

    // fetch players
    const { data: p, error: pErr } = await supabase.from('players').select('*').eq('tournament_id', tid).limit(5);
    if (pErr) {
      console.error('Error fetching players:', pErr.message || pErr);
      process.exit(1);
    }
    console.log('Sample players:', p || []);

    console.log('Supabase read checks OK');
  } catch (err) {
    console.error('Unexpected error:', err.message || err);
    process.exit(1);
  }
}

run();
