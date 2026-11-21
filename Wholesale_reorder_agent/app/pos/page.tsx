'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell, TopBar, Toast } from '@/components/shell';
import { StatusChip } from '@/components/status-chip';

interface PO {
  id: string;
  po_number: string;
  supplier_id: string;
  status: 'draft' | 'approved' | 'rejected';
  total_units: number;
  subtotal: number;
  total: number;
  why_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  pdf_path: string | null;
  created_at: string;
  supplier_name: string;
  lines: any[];
}

export default function PosListPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'draft' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) { window.location.href = '/login'; return; }
        return res.json();
      })
      .then(d => {
        if (d?.pos) setPos(d.pos);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = tab === 'all' ? pos : pos.filter(p => p.status === tab);
  const draftCount = pos.filter(p => p.status === 'draft').length;

  return (
    <AppShell draftCount={draftCount}>
      <TopBar title="Purchase orders" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-[1184px]">
          <div className="mb-5 flex gap-1.5">
            {(['all', 'draft', 'approved', 'rejected'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-[#1E3A8A] text-white' : 'bg-white text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
              >
                {t} ({t === 'all' ? pos.length : pos.filter(p => p.status === t).length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E7EB] py-20 text-center">
              <p className="text-sm text-[#9CA3AF]">No purchase orders. Run <span className="font-medium text-[#4B5563]">Check stock</span> to draft some.</p>
              <Link href="/" className="mt-3 inline-block text-sm font-medium text-[#1E3A8A] underline">Go to Stock watch</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(po => (
                <Link
                  key={po.id}
                  href={`/pos/${po.po_number.replace('PO-', '')}`}
                  className="block rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)] transition-shadow hover:shadow-[0_1px_2px_rgb(0_0_0/.04),0_12px_32px_-12px_rgb(0_0_0/.12)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-[#111827]">{po.po_number}</span>
                      <StatusChip status={po.status} />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tnum text-[#111827]">${Number(po.total).toFixed(2)}</div>
                      <div className="text-xs text-[#9CA3AF]">{po.total_units} units</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm text-[#4B5563]">{po.supplier_name} · {po.lines.length} line items</div>
                    <div className="text-xs text-[#9CA3AF]">
                      {new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
