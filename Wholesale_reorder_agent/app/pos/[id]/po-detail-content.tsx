'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell, TopBar, Toast } from '@/components/shell';
import { StatusChip } from '@/components/status-chip';

interface PoLine {
  id: string;
  shopify_variant_id: string;
  supplier_sku: string | null;
  item_name: string;
  size: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

interface PO {
  id: string;
  po_number: string;
  supplier_id: string;
  status: 'draft' | 'approved' | 'rejected';
  total_units: number;
  subtotal: number;
  tax_total: number;
  total: number;
  why_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  pdf_path: string | null;
  created_at: string;
  supplier_name: string;
  lines: PoLine[];
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  address: string | null;
  lead_time_days: number;
  moq: number;
  case_pack: number;
}

export default function PoDetailContent({ id }: { id: string }) {
  // The list links to /pos/2026-0001 (PO number with the "PO-" prefix stripped);
  // only prepend the prefix when the id does not already carry it.
  const poNumber = id.startsWith('PO-')
    ? id
    : id.startsWith('2026-')
      ? `PO-${id}`
      : `PO-2026-${id.padStart(4, '0')}`;
  const [po, setPo] = useState<PO | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) { window.location.href = '/login'; return; }
        return res.json();
      })
      .then(d => {
        if (!d) return;
        const found = (d.pos as PO[]).find(p => p.po_number === poNumber);
        if (!found) {
          setError('Purchase order not found');
          setLoading(false);
          return;
        }
        setPo(found);
        const sup = (d.suppliers as Supplier[]).find(s => s.id === found.supplier_id);
        setSupplier(sup ?? null);
        const qtys: Record<string, number> = {};
        found.lines.forEach(l => { qtys[l.id] = l.qty; });
        setLineQtys(qtys);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, [poNumber]);

  const approve = async () => {
    if (!po) return;
    setApproving(true);
    setError('');
    try {
      const lines = Object.entries(lineQtys).map(([id, qty]) => ({ id, qty }));
      const res = await fetch(`/api/pos/${po.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_id: po.id, lines }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Approval failed');
      } else {
        const d = await res.json();
        setPo(d.po);
        setToast({ message: `${po.po_number} approved — added to Outbox`, type: 'success' });
      }
    } catch {
      setError('Network error');
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!po) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/pos/${po.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Rejection failed');
      } else {
        const d = await res.json();
        setPo(d.po);
        setToast({ message: `${po.po_number} rejected`, type: 'error' });
        setRejectReason('');
      }
    } catch {
      setError('Network error');
    } finally {
      setRejecting(false);
    }
  };

  const recalcLineTotal = (line: PoLine, qty: number) => {
    return Math.round(line.unit_cost * qty * 100) / 100;
  };

  const editedSubtotal = po
    ? po.lines.reduce((s, l) => s + recalcLineTotal(l, lineQtys[l.id] ?? l.qty), 0)
    : 0;
  const editedUnits = po
    ? po.lines.reduce((s, l) => s + (lineQtys[l.id] ?? l.qty), 0)
    : 0;

  const draftCount = po?.status === 'draft' ? 1 : 0;

  return (
    <AppShell draftCount={draftCount}>
      <TopBar title="Purchase order" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-[1184px]">
          {loading ? (
            <div className="h-96 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
          ) : error && !po ? (
            <div className="rounded-2xl border border-[#B91C1C]/20 bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">{error}</div>
          ) : po ? (
            <>
              <div className="mb-5 flex items-center gap-3">
                <Link href="/pos" className="text-sm text-[#4B5563] hover:text-[#111827]">← Purchase orders</Link>
                <span className="text-[#E5E7EB]">/</span>
                <span className="font-mono text-sm font-semibold text-[#111827]">{po.po_number}</span>
                <StatusChip status={po.status} />
              </div>

              <div className="grid grid-cols-[1fr_400px] gap-6">
                {/* PDF preview */}
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#111827]">PDF preview</h3>
                    {po.pdf_path && (
                      <a
                        href={po.pdf_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1E3A8A] underline"
                      >
                        Open in new tab
                      </a>
                    )}
                  </div>
                  {po.pdf_path ? (
                    <iframe
                      src={po.pdf_path}
                      className="h-[600px] w-full rounded-lg border border-[#E5E7EB]"
                      title="PO PDF preview"
                    />
                  ) : (
                    <div className="flex h-[600px] items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] text-sm text-[#9CA3AF]">
                      No PDF generated yet
                    </div>
                  )}
                </div>

                {/* Right column: summary + approval */}
                <div className="space-y-4">
                  {/* Summary card */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                    <h3 className="mb-3 text-sm font-semibold text-[#111827]">Summary</h3>
                    {supplier && (
                      <div className="mb-4 space-y-1">
                        <div className="text-sm font-medium text-[#111827]">{supplier.name}</div>
                        <div className="text-xs text-[#4B5563]">{supplier.email}</div>
                        <div className="text-xs text-[#9CA3AF]">
                          Lead time {supplier.lead_time_days} days · MOQ {supplier.moq} · Case pack {supplier.case_pack}
                        </div>
                        <div className="text-xs text-[#9CA3AF]">
                          Expected arrival: {new Date(Date.now() + supplier.lead_time_days * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    )}

                    {/* Lines */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-[#9CA3AF]">Line items</div>
                      {po.lines.map(l => (
                        <div key={l.id} className="flex items-center justify-between rounded-lg bg-[#F6F7F9] px-3 py-2">
                          <div className="flex-1">
                            <div className="text-sm text-[#111827]">{l.item_name} <span className="text-[#9CA3AF]">{l.size}</span></div>
                            <div className="text-xs text-[#9CA3AF]">${Number(l.unit_cost).toFixed(2)}/unit</div>
                          </div>
                          {po.status === 'draft' ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setLineQtys(q => ({ ...q, [l.id]: Math.max(0, (q[l.id] ?? l.qty) - (supplier?.case_pack ?? 1)) }))}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E5E7EB] text-[#4B5563] hover:bg-[#E5E7EB]"
                              >−</button>
                              <input
                                type="number"
                                value={lineQtys[l.id] ?? l.qty}
                                onChange={e => setLineQtys(q => ({ ...q, [l.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                className="w-12 rounded-md border border-[#E5E7EB] px-1 py-0.5 text-center text-sm tnum"
                              />
                              <button
                                onClick={() => setLineQtys(q => ({ ...q, [l.id]: (q[l.id] ?? l.qty) + (supplier?.case_pack ?? 1) }))}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E5E7EB] text-[#4B5563] hover:bg-[#E5E7EB]"
                              >+</button>
                            </div>
                          ) : (
                            <div className="text-sm tnum text-[#111827]">{l.qty}</div>
                          )}
                          <div className="ml-3 w-16 text-right text-sm tnum text-[#111827]">
                            ${recalcLineTotal(l, lineQtys[l.id] ?? l.qty).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="mt-4 space-y-1.5 border-t border-[#E5E7EB] pt-3">
                      <div className="flex justify-between text-sm text-[#4B5563]">
                        <span>Units</span>
                        <span className="tnum">{editedUnits}</span>
                      </div>
                      <div className="flex justify-between text-sm text-[#4B5563]">
                        <span>Subtotal</span>
                        <span className="tnum">${editedSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-[#4B5563]">
                        <span>Tax</span>
                        <span className="tnum">$0.00</span>
                      </div>
                      <div className="flex justify-between border-t border-[#1E3A8A] pt-2 text-base font-bold text-[#111827]">
                        <span>Total</span>
                        <span className="tnum">${editedSubtotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Why note */}
                  {po.why_note && (
                    <div className="rounded-2xl border border-[#1E3A8A]/20 bg-[#EFF4FF] p-4">
                      <div className="mb-1 text-xs font-medium text-[#1E3A8A]">Why this PO is drafted</div>
                      <p className="text-sm text-[#1E3A8A]">{po.why_note}</p>
                    </div>
                  )}

                  {/* Approval card */}
                  {po.status === 'draft' && (
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                      <h3 className="mb-2 text-sm font-semibold text-[#111827]">Approve {po.po_number}?</h3>
                      <p className="mb-1 text-sm text-[#4B5563]">
                        Total: <span className="font-semibold tnum text-[#111827]">${editedSubtotal.toFixed(2)}</span>
                      </p>
                      {supplier && (
                        <p className="mb-1 text-xs text-[#9CA3AF]">
                          Would be emailed to {supplier.email}
                        </p>
                      )}
                      <div className="mb-4 rounded-lg bg-[#FFFBEB] px-3 py-2 text-xs text-[#B45309]">
                        Nothing is sent: the email goes to the Outbox.
                      </div>
                      {error && <div className="mb-3 text-sm text-[#B91C1C]">{error}</div>}
                      <div className="flex gap-2">
                        <button
                          onClick={approve}
                          disabled={approving}
                          className="flex-1 rounded-lg bg-[#1E3A8A] py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 transition-colors"
                        >
                          {approving ? 'Approving…' : 'Approve PO'}
                        </button>
                        <button
                          onClick={() => {
                            if (rejectReason !== '' || rejecting) {
                              reject();
                            } else {
                              setRejectReason(' ');
                              setRejecting(true);
                            }
                          }}
                          className="rounded-lg border border-[#B91C1C]/30 px-4 py-2 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                      {rejecting && (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={rejectReason === ' ' ? '' : rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Reason (optional)"
                            className="flex-1 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-sm"
                          />
                          <button
                            onClick={reject}
                            disabled={rejecting}
                            className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#B91C1C]/90"
                          >
                            Confirm reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {po.status === 'approved' && (
                    <div className="rounded-2xl border border-[#1E3A8A]/20 bg-[#EFF4FF] p-5">
                      <div className="text-sm font-semibold text-[#1E3A8A]">✓ Approved</div>
                      <p className="mt-1 text-xs text-[#4B5563]">
                        Approved by {po.approved_by} on{' '}
                        {po.approved_at ? new Date(po.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </p>
                      <Link href="/outbox" className="mt-2 inline-block text-sm font-medium text-[#1E3A8A] underline">View in Outbox →</Link>
                    </div>
                  )}

                  {po.status === 'rejected' && (
                    <div className="rounded-2xl border border-[#B91C1C]/20 bg-[#FEF2F2] p-5">
                      <div className="text-sm font-semibold text-[#B91C1C]">Rejected</div>
                      {po.rejected_reason && <p className="mt-1 text-xs text-[#4B5563]">{po.rejected_reason}</p>}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppShell>
  );
}
