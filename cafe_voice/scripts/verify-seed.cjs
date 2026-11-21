require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const c = new Client({
  connectionString: process.env.SUPABASE_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();

  const r1 = await c.query('SELECT COUNT(*) AS n FROM bookings');
  console.log('bookings count:', r1.rows[0].n);

  const r2 = await c.query(
    "SELECT reference, guest_name, party_size, status, " +
    "to_char(starts_at AT TIME ZONE 'America/New_York', 'Dy HH24:MI') AS local_time " +
    "FROM bookings ORDER BY starts_at LIMIT 10"
  );
  console.table(r2.rows);

  const r3 = await c.query(
    "SELECT b.reference, " +
    "btrim(lower(to_char(b.starts_at AT TIME ZONE ri.timezone, 'day'))) AS dow, " +
    "to_char(b.starts_at AT TIME ZONE ri.timezone, 'HH24:MI') AS local_hm, " +
    "(ri.hours->btrim(lower(to_char(b.starts_at AT TIME ZONE ri.timezone, 'day')))->>'open') AS opens, " +
    "(ri.hours->btrim(lower(to_char(b.starts_at AT TIME ZONE ri.timezone, 'day')))->>'close') AS closes " +
    "FROM bookings b, restaurant_info ri ORDER BY b.starts_at"
  );
  let allOk = true;
  for (const row of r3.rows) {
    const hm = row.local_hm;
    const ok = hm >= row.opens && hm < row.closes;
    if (!ok) {
      allOk = false;
      console.log(`OUT OF HOURS: ${row.reference} dow=${row.dow} hm=${hm} opens=${row.opens} closes=${row.closes}`);
    }
  }
  console.log('All within opening hours:', allOk);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
