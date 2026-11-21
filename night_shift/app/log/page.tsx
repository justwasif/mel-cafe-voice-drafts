"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApprovalLogEntry } from "@/lib/types";

export default function LogPage() {
  const router = useRouter();
  const [log, setLog] = useState<ApprovalLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/log", { credentials: "same-origin" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return [];
        }
        return res.json();
      })
      .then((data: ApprovalLogEntry[]) => setLog(data.reverse()))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopStrip run={null} onRunNow={() => router.push("/")} running={false} />
      <main className="flex-1 p-8">
        <h1 className="mb-6 text-2xl font-semibold text-foreground">Log</h1>

        {loading && <p className="text-secondary">Loading…</p>}

        {!loading && log.length === 0 && (
          <p className="text-secondary">No approval actions yet.</p>
        )}

        {!loading && (
          <div className="space-y-3">
            {log.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {entry.action === "approve" && "Approved & posted"}
                      {entry.action === "skip" && "Skipped"}
                      {entry.action === "expire" && "Expired"}
                    </p>
                    <p className="text-xs text-secondary">
                      {entry.resultText}
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">
                      {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {entry.url && (
                      <a href={entry.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                        Open
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
