"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import type { Run } from "@/lib/types";

export default function RunDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-secondary">Loading…</div>}>
      <RunDetailBody />
    </Suspense>
  );
}

function RunDetailBody() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<Run | null>(null);
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
      .then((runs: Run[]) => {
        const found = runs.find((r) => r.id === id) || null;
        setRun(found);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopStrip run={null} onRunNow={() => {}} running={false} />
        <main className="flex-1 p-8">
          <p className="text-secondary">Loading…</p>
        </main>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopStrip run={null} onRunNow={() => {}} running={false} />
        <main className="flex-1 p-8">
          <p className="text-secondary">Run not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopStrip run={null} onRunNow={() => {}} running={false} />
      <main className="flex-1 p-8">
        <button
          onClick={() => router.push("/runs")}
          className="mb-4 flex items-center gap-1 text-sm text-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to runs
        </button>

        <h1 className="mb-6 text-2xl font-semibold text-foreground">
          Run · {new Date(run.startedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </h1>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {run.steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{step.label}</span>
                  <span
                    className={`text-xs ${
                      step.status === "done"
                        ? "text-status-posted"
                        : step.status === "error"
                          ? "text-red-400"
                          : step.status === "running"
                            ? "text-status-running"
                            : "text-muted"
                    }`}
                  >
                    {step.status}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing diffs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {run.pricing.diffs.map((diff) => (
                <div key={diff.slug} className="rounded-lg border border-border bg-surface p-4">
                  <p className="font-medium text-foreground">{diff.title}</p>
                  {diff.error && <p className="text-xs text-red-400">{diff.error}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {diff.changes.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-secondary"
                      >
                        {c.type === "no-change" ? "No change" : `${c.type}${c.plan ? ` · ${c.plan}` : ""}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sentry issues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {run.sentry.issues.length === 0 && <p className="text-sm text-muted">No issues.</p>}
              {run.sentry.issues.map((issue) => (
                <div key={issue.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{issue.title}</p>
                    <p className="text-xs text-secondary">
                      {issue.culprit} · {issue.count24h} events · {issue.userCount} users
                    </p>
                    <div className="mt-1 flex gap-2 text-xs">
                      {issue.isNew && <span className="text-sentry-new">New</span>}
                      {issue.regressed && <span className="text-sentry-regressed">Regressed</span>}
                      {issue.resolved && <span className="text-sentry-resolved">Resolved</span>}
                    </div>
                  </div>
                  <a href={issue.permalink} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                    View
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
