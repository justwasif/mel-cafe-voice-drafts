'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { formatDistanceToNow, isToday } from 'date-fns';

// Cookie-based session, so the /api/owner/* routes (which read cookies) see the login.
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Request = {
  id: string;
  reference: string;
  type: 'refund' | 'discount';
  shopify_order_id: string;
  order_name: string;
  customer_email: string;
  amount: number | null;
  currency: string | null;
  line_items: any;
  reason: string;
  ai_summary: string;
  discount_percent: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  shopify_result: any;
  error: string | null;
};

type Toast = { id: number; message: string; type: 'success' | 'error' } | null;

export default function OwnerDashboard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'failed'>('pending');
  const [rejectNote, setRejectNote] = useState('');
  const [activeReject, setActiveReject] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchRequests = useCallback(async () => {
    const res = await fetch('/api/owner/requests', { credentials: 'include' });
    if (res.ok) setRequests(await res.json());
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchRequests();
    const channel = supabase
      .channel('approval_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, fetchRequests]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('Login failed', 'error');
    setLoading(false);
  }

  async function approve(reference: string) {
    const res = await fetch('/api/owner/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      showToast(`${reference} approved — ${data.result?.refundId ? 'refund issued' : 'discount created'}`, 'success');
      fetchRequests();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(`Failed: ${data.error || 'unknown'}`, 'error');
    }
  }

  async function reject(reference: string) {
    const res = await fetch('/api/owner/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, note: rejectNote }),
      credentials: 'include',
    });
    if (res.ok) {
      showToast(`${reference} rejected`, 'error');
      setRejectNote('');
      setActiveReject(null);
      fetchRequests();
    }
  }

  // Stats
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedToday = requests.filter(r => r.status === 'approved' && r.decided_at && isToday(new Date(r.decided_at))).length;
  const totalRefunded = requests
    .filter(r => r.status === 'approved' && r.type === 'refund')
    .reduce((sum, r) => sum + (r.amount ? parseFloat(String(r.amount)) : 0), 0);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-700 text-sm font-bold text-white">N</div>
            <div>
              <div className="text-base font-semibold text-forest-800">Northwind</div>
              <div className="text-xs text-stone-500">Owner Dashboard</div>
            </div>
          </div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="mb-3 w-full rounded-xl border border-stone-200 bg-cream px-3 py-2.5 text-sm outline-none focus:border-forest-400 transition-colors" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="mb-4 w-full rounded-xl border border-stone-200 bg-cream px-3 py-2.5 text-sm outline-none focus:border-forest-400 transition-colors" />
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 disabled:opacity-50 transition-colors">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  const filtered = requests.filter(r => r.status === tab);

  const tabs: Array<{ key: typeof tab; label: string; color: string }> = [
    { key: 'pending', label: 'Pending', color: 'amber' },
    { key: 'approved', label: 'Approved', color: 'green' },
    { key: 'rejected', label: 'Rejected', color: 'red' },
    { key: 'failed', label: 'Failed', color: 'stone' },
  ];

  function statusPill(status: string) {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      failed: 'bg-stone-200 text-stone-600',
    };
    return map[status] || 'bg-stone-100 text-stone-500';
  }

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-warm-white p-4 sm:flex">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-sm font-bold text-white">N</div>
          <span className="text-sm font-semibold text-forest-800">Northwind</span>
        </div>
        <nav className="flex-1 space-y-1">
          <div className="rounded-lg bg-forest-50 px-3 py-2 text-sm font-medium text-forest-700">Approval Queue</div>
          <a href="/" className="block rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 transition-colors">Storefront</a>
        </nav>
        <button onClick={() => supabase.auth.signOut()} className="rounded-lg px-3 py-2 text-left text-sm text-stone-500 hover:bg-stone-100 transition-colors">
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-forest-800">Approval Queue</h1>
            <span className="text-sm text-stone-400">{requests.length} total</span>
          </div>

          {/* Stat Tiles */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-stone-500">Pending</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{pendingCount}</div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-stone-500">Approved Today</div>
              <div className="mt-1 text-2xl font-bold text-forest-600">{approvedToday}</div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-stone-500">Total Refunded</div>
              <div className="mt-1 text-2xl font-bold text-terracotta-500">${totalRefunded.toFixed(2)}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1.5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-forest-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'
                }`}
              >
                {t.label} ({requests.filter(r => r.status === t.key).length})
              </button>
            ))}
          </div>

          {/* Queue */}
          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="slide-in-right rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                      <span className="text-sm font-semibold text-forest-800">
                        {r.type === 'refund' ? 'Refund' : `${r.discount_percent}% Discount`}
                      </span>
                      <span className="text-xs text-stone-400">{r.reference}</span>
                    </div>
                    <div className="mt-1.5 text-sm text-stone-600">
                      {r.order_name} · {r.customer_email}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-stone-800">
                      {r.type === 'refund' ? `$${parseFloat(String(r.amount || 0)).toFixed(2)}` : `${r.discount_percent}%`}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                {/* AI summary */}
                <div className="mt-2 rounded-lg bg-forest-50 px-3 py-1.5 text-[12px] text-forest-700">
                  <span className="font-medium">AI:</span> {r.ai_summary}
                </div>

                {/* Reason */}
                {r.reason && (
                  <div className="mt-1.5 text-[12px] text-stone-500">
                    <span className="font-medium">Reason:</span> {r.reason}
                  </div>
                )}

                {/* Result */}
                {r.status === 'approved' && r.shopify_result && (
                  <div className="mt-2 rounded-lg bg-green-50 px-3 py-1.5 text-[12px] text-green-700">
                    {r.shopify_result.refundId ? '✓ Refund issued on Shopify' : `✓ Discount code: ${r.shopify_result.code}`}
                  </div>
                )}
                {r.status === 'failed' && r.error && (
                  <div className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700">Error: {r.error}</div>
                )}
                {r.status === 'rejected' && r.decision_note && (
                  <div className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700">Note: {r.decision_note}</div>
                )}

                {/* Actions */}
                {r.status === 'pending' && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => approve(r.reference)}
                      className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setActiveReject(r.reference)}
                      className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                    {activeReject === r.reference && (
                      <div className="flex flex-1 items-center gap-2 slide-up">
                        <input
                          value={rejectNote}
                          onChange={e => setRejectNote(e.target.value)}
                          placeholder="Optional note for customer"
                          className="flex-1 rounded-lg border border-stone-200 px-2 py-1 text-sm outline-none focus:border-red-300"
                        />
                        <button onClick={() => reject(r.reference)} className="rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                          Confirm
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-stone-200 py-16 text-center text-stone-400">
                No {tab} requests
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fade-in fixed bottom-5 right-5 z-50 rounded-xl bg-white px-4 py-3 shadow-xl border border-stone-200">
          <div className={`text-sm font-medium ${toast.type === 'success' ? 'text-forest-700' : 'text-red-600'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
