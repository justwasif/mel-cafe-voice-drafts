require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const conn = process.env.SUPABASE_CONNECTION_STRING;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

(async () => {
  // --- Direct DB checks ---
  const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const counts = await c.query(`
    SELECT 'restaurant_info' AS t, COUNT(*) AS n FROM restaurant_info
    UNION ALL SELECT 'dining_tables', COUNT(*) FROM dining_tables
    UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
  `);
  console.log('Row counts:');
  console.table(counts.rows);

  // find_open_tables for 4 people this Friday at 7pm
  // "this Friday" = compute in America/New_York
  const fri = await c.query(`
    WITH ri AS (SELECT timezone FROM restaurant_info LIMIT 1)
    SELECT ((now() AT TIME ZONE ri.timezone)::date +
            ((6 - EXTRACT(ISODOW FROM (now() AT TIME ZONE ri.timezone)::date)::int + 7) % 7)
           )::text AS friday_date
    FROM ri
  `);
  const fridayDate = fri.rows[0].friday_date;
  const startsAt = `${fridayDate}T19:00:00`;
  console.log('Friday at 7pm starts_at (local):', startsAt);

  const tables = await c.query(
    'SELECT * FROM find_open_tables($1, $2::timestamptz)',
    [4, startsAt]
  );
  console.log('find_open_tables(4, Friday 7pm):');
  console.table(tables.rows);

  await c.end();

  // --- Anon RLS check ---
  const anon = createClient(url, anonKey);
  const { data: anonData, error: anonErr } = await anon.from('bookings').select('*').limit(1);
  if (anonErr) {
    console.log('Anon RLS check: BLOCKED (correct) — error:', anonErr.message);
  } else if (!anonData || anonData.length === 0) {
    console.log('Anon RLS check: BLOCKED (correct) — returned 0 rows');
  } else {
    console.log('Anon RLS check: FAILED — anon can read bookings!');
    console.table(anonData);
    process.exit(1);
  }

  console.log('\nAll verification checks passed.');
})().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
