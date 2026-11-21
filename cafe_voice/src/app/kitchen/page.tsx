'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import { OrderWithItems, OrderStatus } from '@/types/cafe';
import { formatCents, timeSince } from '@/lib/utils';
import { Check, X, AlertCircle } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://placeholder';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

type Column = 'new' | 'awaiting_payment' | 'paid' | 'ready';

const COLUMNS: { key: Column; label: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'New', statuses: ['sent_to_kitchen'] },
  { key: 'awaiting_payment', label: 'Confirmed · Awaiting payment', statuses: ['confirmed', 'payment_link_sent'] },
  { key: 'paid', label: 'Paid · preparing', statuses: ['paid'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
];

export default function KitchenScreen() {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey));
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    fetchOrders();

    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cf_orders' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cf_order_items' }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, supabase]);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('cf_orders')
      .select('*, items:cf_order_items(*)')
      .in('status', ['sent_to_kitchen', 'confirmed', 'payment_link_sent', 'paid', 'ready'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data as OrderWithItems[]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setToast(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const confirmOrder = async (order: OrderWithItems) => {
    const res = await fetch('/api/confirm-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ order_id: order.id }),
    });

    const data = await res.json();
    if (!res.ok) {
      setToast(data.error || 'Confirm failed');
    } else {
      setToast(`Confirmed ${order.order_number}`);
      fetchOrders();
    }
    setTimeout(() => setToast(null), 3000);
  };

  const markUnavailable = async (orderId: string, itemId: string) => {
    const res = await fetch('/api/kitchen/item-unavailable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ order_id: orderId, item_id: itemId }),
    });
    if (res.ok) fetchOrders();
  };

  const rejectOrder = async (orderId: string) => {
    const res = await fetch('/api/kitchen/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ order_id: orderId, reason: rejectReason }),
    });
    if (res.ok) {
      setRejectingId(null);
      setRejectReason('');
      fetchOrders();
    }
  };

  const markReady = async (orderId: string) => {
    const res = await fetch('/api/kitchen/ready', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ order_id: orderId }),
    });
    if (res.ok) fetchOrders();
  };

  if (!session) {
    return (
      <main className="kitchen flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
          <h1 className="mb-4 font-mono text-2xl">Staff Login</h1>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button type="submit" className="w-full rounded-xl bg-accent py-2 text-sm font-medium text-white hover:bg-accent-hover">
              Sign In
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="kitchen flex min-h-screen flex-col bg-background px-4 py-4 text-foreground">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Kitchen Display</h1>
          <p className="text-xs text-muted">Ember & Oat · Stripe test mode</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted">Open orders: {orders.length}</p>
          <button onClick={handleLogout} className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface">
            Log out
          </button>
        </div>
      </header>

      {toast && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-3 rounded-xl bg-sage/20 px-4 py-2 text-sm text-sage">
          {toast}
        </motion.div>
      )}

      <div className="grid flex-1 grid-cols-4 gap-3 overflow-x-auto">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex min-w-[280px] flex-col rounded-2xl border border-border bg-surface/50 p-3">
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-wide text-muted">{col.label}</h2>
            <div className="flex flex-1 flex-col gap-3">
              <AnimatePresence>
                {orders
                  .filter((o) => col.statuses.includes(o.status))
                  .map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-lg font-semibold">{order.order_number}</p>
                          <p className="text-sm text-muted">{order.customer_name}</p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                            order.status === 'sent_to_kitchen' && 'bg-amber-500/20 text-amber-500',
                            order.status === 'confirmed' && 'bg-blue-500/20 text-blue-500',
                            order.status === 'payment_link_sent' && 'bg-blue-500/20 text-blue-500',
                            order.status === 'paid' && 'bg-green-500/20 text-green-500',
                            order.status === 'ready' && 'bg-sage/20 text-sage'
                          )}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1">
                        {order.items.map((item) => (
                          <div key={item.id} className={cn('flex justify-between text-sm', item.unavailable && 'opacity-50 line-through')}>
                            <span>
                              {item.qty}× {item.name} ({item.size})
                            </span>
                            <span className="text-muted">{formatCents(item.line_total)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                        <Timer since={order.created_at} />
                        <p className="font-mono text-base font-semibold">{formatCents(order.total_amount)}</p>
                      </div>

                      {order.status === 'sent_to_kitchen' && (
                        <div className="mt-3 space-y-2">
                          <button
                            onClick={() => confirmOrder(order)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage py-3 text-base font-semibold text-white hover:bg-sage/80"
                          >
                            <Check className="h-5 w-5" />
                            Confirm order
                          </button>
                          <button
                            onClick={() => setRejectingId(order.id)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2 text-sm text-red-400 hover:bg-red-500/10"
                          >
                            <X className="h-4 w-4" />
                            Reject
                          </button>
                          {rejectingId === order.id && (
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Reason..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
                              />
                              <button
                                onClick={() => rejectOrder(order.id)}
                                className="w-full rounded-lg bg-red-500/20 py-1.5 text-sm font-medium text-red-400"
                              >
                                Confirm reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {(order.status === 'confirmed' || order.status === 'payment_link_sent') && (
                        <div className="mt-3 space-y-2">
                          {order.items.map((item) =>
                            !item.unavailable ? (
                              <button
                                key={item.id}
                                onClick={() => markUnavailable(order.id, item.id)}
                                className="flex w-full items-center gap-2 rounded-lg border border-amber-500/30 px-2 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10"
                              >
                                <AlertCircle className="h-3 w-3" />
                                Mark {item.name} unavailable
                              </button>
                            ) : null
                          )}
                        </div>
                      )}

                      {order.status === 'paid' && (
                        <button
                          onClick={() => markReady(order.id)}
                          className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-semibold text-white hover:bg-accent-hover"
                        >
                          Ready
                        </button>
                      )}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Timer({ since }: { since: string }) {
  const [label, setLabel] = useState(timeSince(since));
  useEffect(() => {
    const id = setInterval(() => setLabel(timeSince(since)), 1000);
    return () => clearInterval(id);
  }, [since]);

  const minutes = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return <span className={cn('font-mono text-xs', minutes >= 5 ? 'text-amber-500' : 'text-muted')}>{label}</span>;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

