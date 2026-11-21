'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Booking } from '@/types';
import { formatDate, formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://placeholder';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export default function HostDashboard() {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey));
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState<'pending' | 'today' | 'upcoming' | 'declined'>('pending');
  const [toast, setToast] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [decliningId, setDecliningId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    fetchBookings();

    const channel = supabase
      .channel('host-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          fetchBookings();
          // soft chime could go here
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, supabase]);

  const fetchBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, dining_tables(label, seats, area)')
      .order('starts_at', { ascending: true });
    if (!error && data) {
      setBookings(data as Booking[]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const updateStatus = async (id: string, status: 'approved' | 'declined', note?: string) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status, decided_at: new Date().toISOString(), decision_note: note || null })
      .eq('id', id);

    if (error) {
      setToast('Error: ' + error.message);
    } else {
      setToast(status === 'approved' ? 'Booking approved' : 'Booking declined');
      fetchBookings();
    }
    setTimeout(() => setToast(null), 3000);
  };

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  const todayStart = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : null;
  const todayEnd = todayStart ? new Date(todayStart) : null;
  if (todayEnd) todayEnd.setDate(todayEnd.getDate() + 1);

  const filtered = bookings.filter((b) => {
    const s = new Date(b.starts_at);
    if (tab === 'pending') return b.status === 'pending';
    if (tab === 'today') return todayStart && todayEnd && s >= todayStart && s < todayEnd && b.status !== 'declined';
    if (tab === 'upcoming') return todayEnd && s >= todayEnd && b.status !== 'declined';
    if (tab === 'declined') return b.status === 'declined';
    return true;
  });

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border border-emerald-900/30 bg-emerald-900/40 p-6 text-amber-50 shadow-xl">
          <h1 className="mb-4 font-serif text-2xl text-amber-100">Host Login</h1>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-emerald-800/40 bg-emerald-950/60 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-emerald-800/40 bg-emerald-950/60 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-100/30 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
            <button type="submit" className="w-full rounded-lg bg-amber-800/40 py-2 text-sm font-medium text-amber-100 hover:bg-amber-800/60">
              Sign In
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-emerald-950 px-4 py-6 text-amber-50">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-amber-100">Host Dashboard</h1>
          <p className="text-xs text-amber-200/50">Lantern & Thyme</p>
        </div>
        <button onClick={handleLogout} className="rounded-lg border border-emerald-800/40 px-3 py-1.5 text-xs text-amber-100/70 hover:bg-emerald-900/50">
          Log out
        </button>
      </header>

      {toast && (
        <div className="mb-4 rounded-lg bg-emerald-800/40 px-4 py-2 text-sm text-emerald-100">
          {toast}
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(['pending', 'today', 'upcoming', 'declined'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium capitalize',
              tab === t ? 'bg-amber-800/40 text-amber-100' : 'text-amber-100/50 hover:bg-emerald-900/40'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-amber-100/30">No bookings in this section.</p>
        )}
        {filtered.map((b) => (
          <div key={b.id} className="rounded-xl border border-emerald-900/20 bg-emerald-900/30 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-amber-100">{b.guest_name}</p>
                <p className="text-xs text-amber-100/60">
                  {b.party_size} guests · {formatDate(b.starts_at)} at {formatTime(b.starts_at)}
                </p>
                <p className="text-xs text-amber-100/40">
                  {b.dining_tables?.label || b.table_id} · {b.reference}
                </p>
                {b.notes && <p className="mt-1 text-xs text-amber-100/50">Notes: {b.notes}</p>}
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                  b.status === 'pending' && 'bg-amber-600/20 text-amber-300',
                  b.status === 'approved' && 'bg-emerald-600/20 text-emerald-300',
                  b.status === 'declined' && 'bg-red-600/20 text-red-300'
                )}
              >
                {b.status}
              </span>
            </div>

            {b.status === 'pending' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => updateStatus(b.id, 'approved')}
                  className="rounded-lg bg-emerald-700/30 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-700/50"
                >
                  Approve
                </button>
                <button
                  onClick={() => setDecliningId(decliningId === b.id ? null : b.id)}
                  className="rounded-lg bg-red-700/20 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-700/40"
                >
                  Decline
                </button>
              </div>
            )}

            {decliningId === b.id && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Optional note..."
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="flex-1 rounded-lg border border-emerald-800/40 bg-emerald-950/60 px-3 py-1.5 text-xs text-amber-50 placeholder:text-amber-100/30"
                />
                <button
                  onClick={() => {
                    updateStatus(b.id, 'declined', declineNote);
                    setDecliningId(null);
                    setDeclineNote('');
                  }}
                  className="rounded-lg bg-red-700/30 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-700/50"
                >
                  Confirm Decline
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tonight timeline */}
      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg text-amber-100">Tonight's Tables</h2>
        <div className="space-y-2">
          {bookings
            .filter((b) => {
              const s = new Date(b.starts_at);
              return todayStart && todayEnd && s >= todayStart && s < todayEnd && b.status !== 'declined';
            })
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
            .map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg border border-emerald-900/20 bg-emerald-900/20 px-3 py-2 text-xs">
                <span className="w-16 text-amber-100/60">{formatTime(b.starts_at)}</span>
                <span className="flex-1 text-amber-100">{b.dining_tables?.label || b.table_id}</span>
                <span className="text-amber-100/50">{b.guest_name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] uppercase',
                    b.status === 'pending' && 'bg-amber-600/20 text-amber-300',
                    b.status === 'approved' && 'bg-emerald-600/20 text-emerald-300'
                  )}
                >
                  {b.status}
                </span>
              </div>
            ))}
          {bookings.filter((b) => {
            const s = new Date(b.starts_at);
            return todayStart && todayEnd && s >= todayStart && s < todayEnd && b.status !== 'declined';
          }).length === 0 && (
            <p className="text-xs text-amber-100/30">No bookings tonight.</p>
          )}
        </div>
      </section>
    </main>
  );
}
