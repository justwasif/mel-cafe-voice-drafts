// Test the findOpenTables tool directly
process.env.NEXT_PUBLIC_SUPABASE_URL = require('dotenv').config({ path: '.env.local' }).parsed.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = require('dotenv').config({ path: '.env.local' }).parsed.SUPABASE_SERVICE_ROLE_KEY;

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  const date = '2026-11-21';
  const time = '19:00';
  const startsAt = new Date(`${date}T${time}:00`);
  console.log('startsAt (local):', startsAt.toString());
  console.log('startsAt (ISO):', startsAt.toISOString());

  const { data, error } = await supabase.rpc('find_open_tables', {
    p_party_size: 4,
    p_starts_at: startsAt.toISOString(),
  });

  if (error) {
    console.error('RPC error:', error.message);
  } else {
    console.log('Tables found:', data.length);
    console.table(data);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
