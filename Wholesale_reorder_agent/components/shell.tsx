'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function AppShell({ children, draftCount = 0 }: { children: React.ReactNode; draftCount?: number }) {
  const [session, setSession] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = '/login';
      } else {
        setSession(data.session);
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return <div className="min-h-screen bg-[#F6F7F9]" />;
  if (!session) return null;

  const navItems = [
    { href: '/', label: 'Stock watch' },
    { href: '/pos', label: 'Purchase orders', badge: draftCount },
    { href: '/outbox', label: 'Outbox' },
    { href: '/suppliers', label: 'Suppliers' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-[#F6F7F9]">
      {/* Sidebar */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white p-4 md:flex">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1E3A8A] text-xs font-bold text-white">RA</div>
          <div>
            <div className="text-sm font-semibold text-[#111827]">Reorder Agent</div>
            <div className="text-[11px] text-[#9CA3AF]">Northwind Supply Co.</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? 'bg-[#EFF4FF] font-medium text-[#1E3A8A]'
                  : 'text-[#4B5563] hover:bg-[#F3F4F6]'
              }`}
            >
              {item.label}
              {item.badge ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1E3A8A] px-1.5 text-[11px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 rounded-lg bg-[#F0FDF4] px-3 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#15803D]" />
          <div className="text-[11px] leading-tight">
            <div className="font-medium text-[#15803D]">Northwind Supply Co.</div>
            <div className="text-[#9CA3AF]">Shopify dev store</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function TopBar({
  title,
  lastCheck,
  onCheckStock,
  checking,
  initials = 'O',
}: {
  title: string;
  lastCheck?: string;
  onCheckStock?: () => void;
  checking?: boolean;
  initials?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-8 py-4">
      <div>
        <h1 className="text-lg font-semibold text-[#111827]">{title}</h1>
        {lastCheck && <p className="text-xs text-[#9CA3AF]">Last check {lastCheck}</p>}
      </div>
      <div className="flex items-center gap-4">
        {onCheckStock && (
          <button
            onClick={onCheckStock}
            disabled={checking}
            className="flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 transition-colors"
          >
            {checking ? (
              <>
                <span className="spin inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                Checking stock…
              </>
            ) : (
              <>Check stock</>
            )}
          </button>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EFF4FF] text-xs font-semibold text-[#1E3A8A]">
          {initials}
        </div>
      </div>
    </header>
  );
}

export function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fade-in fixed bottom-6 right-6 z-50 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_24px_-8px_rgb(0_0_0/.12)]">
      <div className={`text-sm font-medium ${type === 'success' ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
        {message}
      </div>
    </div>
  );
}

// Re-export for convenience
export { supabase };
