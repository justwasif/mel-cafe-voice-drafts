import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const connectionString = process.env.SUPABASE_CONNECTION_STRING;
if (!connectionString) {
  console.error('Missing SUPABASE_CONNECTION_STRING');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-migration.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(file, 'utf-8');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Migration applied:', file);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
