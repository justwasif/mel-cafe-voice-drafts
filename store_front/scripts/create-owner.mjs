import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

if (!url || !serviceRole || !email || !password) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Check if user already exists
const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
if (listErr) {
  console.error('Failed to list users:', listErr.message);
  process.exit(1);
}

const existing = list.users.find((u) => u.email === email);
if (existing) {
  console.log('Owner user already exists:', existing.id);
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error('Failed to create owner:', error.message);
  process.exit(1);
}

console.log('Owner user created:', data.user.id);
