'use client';

import { useState, useEffect } from 'react';
import { AppShell, TopBar } from '@/components/shell';

interface OutboxEntry {
  id: string;
  po_id: string;
  to_email: string;
  subject: string;
  body: string;
  pdf_path: string;
  sent_at: string | null;
  po: any;
  lines: any[];
}

export default function OutboxPage() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/outbox', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) { window.location.href = '/login'; return; }
        return res.json();
      })
      .then(d => {
        if (d?.entries) {
          setEntries(d.entries);
          if (d.entries.length > 0) setSelected(d.entries[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedEntry = entries.find(e => e.id === selected);

  return (
    <AppShell>
      <TopBar title="Outbox" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-[1184px]">
          {/* Demo banner */}
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#B45309]/20 bg-[#FFFBEB] px-4 py-3">
            <span className="text-sm text-[#B45309]">Demo: emails are not sent. This is what would be emailed to each supplier.</span>
          </div>

          {loading ? (
            <div className="h-96 rounded-2xl border border-[#E5E7EB] bg-white animate-pulse" />
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E7EB] py-20 text-center">
              <p className="text-sm text-[#9CA3AF]">No approved POs yet. Approve a purchase order to see the email here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[360px_1fr] gap-6">
              {/* Email list */}
              <div className="space-y-2">
                {entries.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e.id)}
                    className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                      selected === e.id
                        ? 'border-[#1E3A8A] bg-[#EFF4FF]'
                        : 'border-[#E5E7EB] bg-white hover:bg-[#F6F7F9]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-[#111827]">{e.po?.po_number ?? '—'}</span>
                      <span className="text-xs text-[#9CA3AF]">
                        {e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#4B5563]">To: {e.to_email}</div>
                    <div className="mt-0.5 truncate text-sm text-[#111827]">{e.subject}</div>
                  </button>
                ))}
              </div>

              {/* Email view */}
              {selectedEntry ? (
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
                  <div className="mb-4 border-b border-[#E5E7EB] pb-4">
                    <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                      <span className="text-[#9CA3AF]">To:</span>
                      <span className="text-[#111827]">{selectedEntry.to_email}</span>
                      <span className="text-[#9CA3AF]">Subject:</span>
                      <span className="font-medium text-[#111827]">{selectedEntry.subject}</span>
                      <span className="text-[#9CA3AF]">Attachment:</span>
                      <a href={selectedEntry.pdf_path} target="_blank" rel="noopener noreferrer" className="font-mono text-[#1E3A8A] underline">
                        {selectedEntry.po?.po_number}.pdf
                      </a>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#4B5563]">
{selectedEntry.body}
                  </pre>
                  <div className="mt-6 flex items-center gap-3 border-t border-[#E5E7EB] pt-4">
                    <a
                      href={selectedEntry.pdf_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF]"
                    >
                      View PDF
                    </a>
                    <span className="text-xs text-[#9CA3AF]">This email was not sent.</span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
