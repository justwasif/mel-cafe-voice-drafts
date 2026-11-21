require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  const email = process.env.HOST_EMAIL;
  const password = process.env.HOST_PASSWORD;

  if (!email || !password) {
    console.error('HOST_EMAIL or HOST_PASSWORD not set');
    process.exit(1);
  }

  // Check if user already exists
  const { data: existing, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list users:', listErr.message);
    process.exit(1);
  }

  const found = existing.users.find(u => u.email === email);
  if (found) {
    console.log('Host user already exists:', found.id);
    process.exit(0);
  }

  // Create the user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error('Failed to create host user:', error.message);
    process.exit(1);
  }

  console.log('Created host user:', data.user.id);
})().catch(e => { console.error(e.message); process.exit(1); });
