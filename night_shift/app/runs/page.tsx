"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Run } from "@/lib/types";

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/run", { credentials: "same-origin" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return [];
        }
        return res.json();
      })
      .then((data: Run[]) => setRuns(data))
      .finally(() => setLoading(false));
  }, [router]);

  const statusColor: Record<string, string> = {
    running: "text-status-running",
    waiting: "text-status-waiting",
    posted: "text-status-posted",
    skipped: "text-status-skipped",
    expired: "text-status-skipped",
    failed: "text-red-400",
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopStrip run={null} onRunNow={() => router.push("/")} running={false} />
      <main className="flex-1 p-8">
        <h1 className="mb-6 text-2xl font-semibold text-foreground">Runs</h1>

        {loading && <p className="text-secondary">Loading…</p>}

        {!loading && runs.length === 0 && (
          <p className="text-secondary">No runs yet.</p>
        )}

        {!loading && runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((run) => {
              const changes = run.pricing.diffs.filter((d) => d.changes.some((c) => c.type !== "no-change")).length;
              return (
                <Card
                  key={run.id}
                  className="cursor-pointer transition-colors hover:bg-surface/80"
                  onClick={() => router.push(`/runs/${run.id}`)}
                >
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-foreground">
                        {new Date(run.startedAt).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      <p className="text-xs text-secondary">
                        {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(0)}s` : "—"} · {changes} changes ·{" "}
                        {run.sentry.newCount} new / {run.sentry.regressedCount} regressed / {run.sentry.resolvedCount} resolved
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[run.status] || "text-muted"}`}>
                      {run.status}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
