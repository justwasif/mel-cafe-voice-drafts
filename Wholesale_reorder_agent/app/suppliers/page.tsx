'use client';

import { useState, useEffect } from 'react';
import { AppShell, TopBar } from '@/components/shell';

interface Supplier {
  id: string;
  name: string;
  email: string;
  address: string | null;
  lead_time_days: number;
  moq: number;
  case_pack: number;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) { window.location.href = '/login'; return; }
        return res.json();
      })
      .then(d => {
        if (d?.suppliers) setSuppliers(d.suppliers);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <TopBar title="Suppliers" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-[1184px]">
          <p className="mb-5 text-sm text-[#4B5563]">Sample suppliers for the Northwind dev store. All addresses and emails are fictional (<span className="font-mono text-xs">@example.com</span>).</p>
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map(i => <div key={i} className="h-48 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {suppliers.map(s => (
                <div key={s.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                  <h3 className="text-sm font-semibold text-[#111827]">{s.name}</h3>
                  <div className="mt-2 space-y-1 text-xs text-[#4B5563]">
                    <div>{s.email}</div>
                    {s.address && <div className="text-[#9CA3AF]">{s.address}</div>}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#E5E7EB] pt-3">
                    <div>
                      <div className="text-xs text-[#9CA3AF]">Lead time</div>
                      <div className="text-sm font-semibold tnum text-[#111827]">{s.lead_time_days}d</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#9CA3AF]">MOQ</div>
                      <div className="text-sm font-semibold tnum text-[#111827]">{s.moq}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#9CA3AF]">Case pack</div>
                      <div className="text-sm font-semibold tnum text-[#111827]">{s.case_pack}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
