// Runs a .sql file against the Supabase Postgres database in one transaction.
// Usage: node scripts/db.mjs <path-to-sql-file>
import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'node:fs';

dotenv.config({ path: '.env.local' });

const conn = process.env.SUPABASE_CONNECTION_STRING;
if (!conn) {
  console.error('SUPABASE_CONNECTION_STRING is not set in .env.local');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/db.mjs <path-to-sql-file>');
  process.exit(1);
}

let sql;
try {
  sql = readFileSync(file, 'utf8');
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`OK: ran ${file}`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`FAIL: ${file}`);
  console.error(e.message);
  process.exit(1);
} finally {
  await client.end();
}
