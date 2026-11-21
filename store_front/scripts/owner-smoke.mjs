import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
  });
  if (error) {
    console.error('Login failed:', error.message);
    process.exit(1);
  }

  const session = data.session;
  console.log('Signed in as owner:', session.user.email);

  // The SSR cookie format used by @supabase/ssr
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const baseCookie = `sb-${projectRef}-auth-token`;
  const cookieValue = encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  }));

  const cookieHeader = `${baseCookie}=${cookieValue}`;

  const requestsRes = await fetch('http://localhost:3000/api/owner/requests', {
    headers: { Cookie: cookieHeader },
  });
  const requests = await requestsRes.json();
  console.log('Pending requests:', requests.filter(r => r.status === 'pending').map(r => `${r.reference} ${r.type} ${r.order_name}`));

  const pendingRefund = requests.find(r => r.status === 'pending' && r.type === 'refund');
  if (pendingRefund) {
    const approveRes = await fetch('http://localhost:3000/api/owner/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reference: pendingRefund.reference }),
    });
    const approveBody = await approveRes.json();
    console.log('Approve result:', approveRes.status, approveBody);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
