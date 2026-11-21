'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = '/';
    });
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = '/';
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9] p-4">
      <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A8A] text-sm font-bold text-white">RA</div>
          <div>
            <div className="text-base font-semibold text-[#111827]">Reorder Agent</div>
            <div className="text-xs text-[#9CA3AF]">Northwind Supply Co.</div>
          </div>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</div>
        )}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="mb-3 w-full rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2.5 text-sm text-[#111827] outline-none focus:border-[#1E3A8A] transition-colors"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="mb-4 w-full rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2.5 text-sm text-[#111827] outline-none focus:border-[#1E3A8A] transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#1E3A8A] py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
