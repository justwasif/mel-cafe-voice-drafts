'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusChip } from './status-chip';

interface Forecast {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  rate: number;
  days_of_cover: number;
  run_out_date: string | null;
  status: string;
  suggested_qty: number;
  supplier_name: string;
  image: string | null;
  po_number: string | null;
  on_order: number;
}

type Filter = 'All' | 'Order now' | 'Watch' | 'OK';

export function SkuTable({
  forecasts,
  currency,
  selectedId,
  onSelect,
}: {
  forecasts: Forecast[];
  currency: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('All');

  const sorted = [...forecasts].sort((a, b) => {
    // No sales to the bottom; otherwise by days of cover ascending
    if (a.days_of_cover === Infinity) return 1;
    if (b.days_of_cover === Infinity) return -1;
    return a.days_of_cover - b.days_of_cover;
  });

  const filtered = filter === 'All' ? sorted : sorted.filter(f => f.status === filter);

  const filters: Filter[] = ['All', 'Order now', 'Watch', 'OK'];

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
        <h3 className="text-sm font-semibold text-[#111827]">SKU table</h3>
        <div className="flex gap-1.5">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#1E3A8A] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-left text-xs text-[#9CA3AF]">
              <th className="px-5 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 text-right font-medium">On hand</th>
              <th className="px-3 py-2.5 text-right font-medium">Sales/day</th>
              <th className="px-3 py-2.5 font-medium">Days of cover</th>
              <th className="px-3 py-2.5 font-medium">Run-out</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">PO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr
                key={f.shopify_variant_id}
                onClick={() => onSelect(f.shopify_variant_id)}
                className={`cursor-pointer border-b border-[#F3F4F6] transition-colors hover:bg-[#F6F7F9] ${
                  selectedId === f.shopify_variant_id ? 'bg-[#EFF4FF]' : ''
                }`}
              >
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {f.image && (
                      <img src={f.image} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    )}
                    <div>
                      <div className="font-medium text-[#111827]">{f.product_title}</div>
                      <div className="text-xs text-[#9CA3AF]">{f.size}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-[#4B5563]">{f.supplier_name}</td>
                <td className="px-3 py-2.5 text-right tnum text-[#111827]">{f.on_hand}</td>
                <td className="px-3 py-2.5 text-right tnum text-[#4B5563]">{f.rate.toFixed(1)}</td>
                <td className="px-3 py-2.5">
                  {f.days_of_cover === Infinity ? (
                    <span className="text-xs text-[#9CA3AF]">∞</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#F3F4F6]">
                        <div
                          className={`h-full rounded-full ${
                            f.days_of_cover <= 14 ? 'bg-[#B91C1C]' : f.days_of_cover <= 30 ? 'bg-[#B45309]' : 'bg-[#15803D]'
                          }`}
                          style={{ width: `${Math.min(100, (f.days_of_cover / 60) * 100)}%` }}
                        />
                      </div>
                      <span className="tnum text-xs text-[#4B5563]">{f.days_of_cover.toFixed(0)}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs tnum text-[#4B5563]">
                  {f.run_out_date ? new Date(f.run_out_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </td>
                <td className="px-3 py-2.5"><StatusChip status={f.status} /></td>
                <td className="px-3 py-2.5">
                  {f.po_number ? (
                    <Link
                      href={`/pos/${f.po_number.replace('PO-', '')}`}
                      onClick={e => e.stopPropagation()}
                      className="font-mono text-xs text-[#1E3A8A] underline hover:text-[#1E40AF]"
                    >
                      {f.po_number}
                    </Link>
                  ) : (
                    <span className="text-xs text-[#E5E7EB]">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-[#9CA3AF]">
                  No SKUs match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
