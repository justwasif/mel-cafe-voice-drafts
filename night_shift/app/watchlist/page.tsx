"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WatchlistEntry } from "@/lib/types";

export default function WatchlistPage() {
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/watchlist", { credentials: "same-origin" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return [];
        }
        return res.json();
      })
      .then((data: WatchlistEntry[]) => setWatchlist(data))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopStrip run={null} onRunNow={() => router.push("/")} running={false} />
      <main className="flex-1 p-8">
        <h1 className="mb-6 text-2xl font-semibold text-foreground">Watchlist</h1>

        {loading && <p className="text-secondary">Loading…</p>}

        {!loading && watchlist.length === 0 && (
          <p className="text-secondary">No pages in watchlist.</p>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {watchlist.map((entry) => (
              <Card key={entry.slug}>
                <CardHeader>
                  <CardTitle className="text-base">{entry.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-secondary break-all">{entry.url}</p>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-xs text-accent hover:underline"
                  >
                    Open page
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
