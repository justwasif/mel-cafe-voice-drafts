'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppShell, TopBar, Toast } from '@/components/shell';
import { HeroChart } from '@/components/hero-chart';
import { SkuTable } from '@/components/sku-table';
import { AgentActivity } from '@/components/agent-activity';
import { StatusChip } from '@/components/status-chip';

interface Forecast {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  rate: number;
  days_of_cover: number;
  run_out_date: string | null;
  reorder_point: number;
  status: 'Order now' | 'Watch' | 'OK' | 'No sales';
  suggested_qty: number;
  supplier_id: string;
  supplier_name: string;
  image: string | null;
  lead_time_days: number;
  case_pack: number;
  moq: number;
  on_order: number;
  retail_price: number;
  po_number: string | null;
}

interface DashboardData {
  forecasts: Forecast[];
  kpis: {
    itemsToReorder: number;
    runningOut14Days: number;
    draftPoCount: number;
    draftPoValue: number;
    nextRunOut: { item: string; date: string } | null;
  };
  pos: any[];
  suppliers: any[];
  runs: any[];
  today: string;
  currency: string;
}

export default function StockWatchPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load dashboard');
        setLoading(false);
        return;
      }
      const d = await res.json();
      setData(d);
      setError('');
    } catch {
      setError('Network error loading dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Auto-select first Order-now variant or first variant
  useEffect(() => {
    if (!data || selectedVariant) return;
    const orderNow = data.forecasts.find(f => f.status === 'Order now');
    const first = orderNow ?? data.forecasts[0];
    if (first) setSelectedVariant(first.shopify_variant_id);
  }, [data, selectedVariant]);

  const checkStock = async () => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/agent/run', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Check stock failed');
      } else {
        const result = await res.json();
        setToast({ message: `Checked ${result.variantsChecked} variants · ${result.draftPosCreated} draft POs created`, type: 'success' });
        await fetchDashboard();
      }
    } catch {
      setError('Network error during check stock');
    } finally {
      setChecking(false);
    }
  };

  const lastRun = data?.runs?.[0];
  const lastCheckText = lastRun
    ? `${new Date(lastRun.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    : 'never';

  const draftCount = data?.pos?.filter(p => p.status === 'draft').length ?? 0;
  const selected = data?.forecasts.find(f => f.shopify_variant_id === selectedVariant) ?? null;

  return (
    <AppShell draftCount={draftCount}>
      <TopBar title="Stock watch" lastCheck={lastCheckText} onCheckStock={checkStock} checking={checking} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-[1184px] space-y-6">
          {error && (
            <div className="flex items-center justify-between rounded-xl border border-[#B91C1C]/20 bg-[#FEF2F2] px-4 py-3">
              <span className="text-sm text-[#B91C1C]">{error}</span>
              <button onClick={fetchDashboard} className="text-sm font-medium text-[#B91C1C] underline">Retry</button>
            </div>
          )}

          {loading ? (
            <DashboardSkeleton />
          ) : data ? (
            <>
              {/* KPI tiles */}
              <div className="grid grid-cols-4 gap-4">
                <KpiTile label="Items to reorder" value={String(data.kpis.itemsToReorder)} accent="order" />
                <KpiTile label="Running out in 14 days" value={String(data.kpis.runningOut14Days)} accent="watch" />
                <KpiTile
                  label="Draft POs"
                  value={String(data.kpis.draftPoCount)}
                  sub={data.currency === 'USD' ? `$${data.kpis.draftPoValue.toFixed(2)}` : `${data.currency} ${data.kpis.draftPoValue.toFixed(2)}`}
                  accent="draft"
                />
                <KpiTile
                  label="Next run-out"
                  value={data.kpis.nextRunOut?.item ?? '—'}
                  sub={data.kpis.nextRunOut ? formatDate(data.kpis.nextRunOut.date) : ''}
                  accent="ok"
                />
              </div>

              <div className="grid grid-cols-[1fr_320px] gap-6">
                {/* Hero chart + SKU table */}
                <div className="space-y-6">
                  {selected ? (
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-semibold text-[#111827]">{selected.product_title}</h2>
                          <p className="text-sm text-[#4B5563]">Size {selected.size} · {selected.supplier_name}</p>
                        </div>
                        <StatusChip status={selected.status} />
                      </div>
                      <HeroChart forecast={selected} today={data.today} />
                      <div className="mt-4 grid grid-cols-4 gap-4 border-t border-[#E5E7EB] pt-4">
                        <Metric label="On hand" value={String(selected.on_hand)} />
                        <Metric label="Sales/day" value={selected.rate.toFixed(1)} />
                        <Metric label="Days of cover" value={selected.days_of_cover === Infinity ? '∞' : selected.days_of_cover.toFixed(0)} />
                        <Metric label="Run-out date" value={selected.run_out_date ? formatDate(selected.run_out_date) : '—'} />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
                      <p className="text-center text-sm text-[#9CA3AF]">No variants to display. Run Check stock.</p>
                    </div>
                  )}

                  <SkuTable
                    forecasts={data.forecasts}
                    currency={data.currency}
                    selectedId={selectedVariant}
                    onSelect={setSelectedVariant}
                  />
                </div>

                {/* Agent activity */}
                <AgentActivity runs={data.runs} />
              </div>
            </>
          ) : null}
        </div>
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppShell>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: 'order' | 'watch' | 'draft' | 'ok' }) {
  const accentColor = {
    order: 'text-[#B91C1C]',
    watch: 'text-[#B45309]',
    draft: 'text-[#4B5563]',
    ok: 'text-[#15803D]',
  }[accent];
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
      <div className="text-xs font-medium text-[#9CA3AF]">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tnum ${accentColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[#4B5563] tnum">{sub}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#9CA3AF]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tnum text-[#111827]">{value}</div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="h-72 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
          <div className="h-96 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
        </div>
        <div className="h-96 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
      </div>
    </>
  );
}
