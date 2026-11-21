"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Wrong password");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-background">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[14px] border border-border bg-surface p-8 shadow"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Moon className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Night Shift</h1>
        </div>
        <p className="text-sm text-secondary">Enter the app password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-6 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-accent"
          placeholder="Password"
          autoFocus
        />
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 h-11 w-full rounded-lg bg-accent text-background font-medium transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
