import { NextResponse } from 'next/server';
import { getServerClient } from './supabase-server';

/**
 * Require an authenticated owner session on a server route.
 * Returns the user on success, or a 401 NextResponse on failure.
 */
export async function requireOwner() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}
