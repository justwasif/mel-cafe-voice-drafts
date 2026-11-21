"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopStrip } from "@/components/top-strip";
import { BuildingState } from "@/components/building-state";
import { Timeline } from "@/components/timeline";
import { ApprovalCard } from "@/components/approval-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Run } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/run", { credentials: "same-origin" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load runs");
      const runs = (await res.json()) as Run[];
      const latest = runs[0] ?? null;
      setRun(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const runNow = useCallback(async () => {
    setBuilding(true);
    try {
      const res = await fetch("/api/run", { method: "POST", credentials: "same-origin" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Run failed" }));
        throw new Error(json.error || "Run failed");
      }
      setRun(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBuilding(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !run) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopStrip run={null} onRunNow={runNow} running={building} />
        <main className="flex-1 p-8">
          <div className="text-secondary">Loading…</div>
        </main>
      </div>
    );
  }

  if (building) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopStrip run={run} onRunNow={runNow} running={building} />
        <main className="flex-1 p-8">
          <BuildingState />
        </main>
      </div>
    );
  }

  const isWaiting = run?.status === "waiting";
  const isPosted = run?.status === "posted";
  const isFirstRun = run && run.pricing.diffs.every((d) => d.changes.some((c) => c.note?.includes("baseline")));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopStrip run={run} onRunNow={runNow} running={building} />
      <main className="flex-1 p-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!run && (
          <div className="mx-auto max-w-xl py-16 text-center">
            <h1 className="text-2xl font-semibold text-foreground">No runs yet</h1>
            <p className="mt-2 text-secondary">Run the night shift to start tracking pricing pages and errors.</p>
            <button
              onClick={runNow}
              className="mt-6 h-11 rounded-lg bg-accent px-6 text-sm font-medium text-background hover:bg-accent-hover"
            >
              Run now
            </button>
          </div>
        )}

        {run && (
          <>
            <section className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">
                {isFirstRun
                  ? "First run: baseline saved"
                  : `Last night&apos;s shift · finished ${new Date(run.finishedAt || run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </h1>
              <p className="mt-1 text-secondary">
                {run.pricing.diffs.filter((d) => d.changes.some((c) => c.type !== "no-change")).length} changes,{" "}
                {run.sentry.newCount} new errors
              </p>
            </section>

            <div className="grid grid-cols-[1fr_380px] gap-6">
              <section className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Night timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Timeline steps={run.steps} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pricing changes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {run.pricing.diffs.filter((d) => d.changes.some((c) => c.type !== "no-change")).length === 0 && (
                      <p className="text-sm text-muted">No pricing changes tonight.</p>
                    )}
                    {run.pricing.diffs
                      .filter((d) => d.changes.some((c) => c.type !== "no-change"))
                      .map((diff) => (
                        <div key={diff.slug} className="rounded-lg border border-border bg-surface p-4">
                          <p className="font-medium text-foreground">{diff.title}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {diff.changes
                              .filter((c) => c.type !== "no-change")
                              .map((c, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    c.type === "price-up"
                                      ? "bg-red-950/30 text-price-up"
                                      : c.type === "price-down"
                                        ? "bg-emerald-950/30 text-price-down"
                                        : c.type === "plan-added"
                                          ? "bg-blue-950/30 text-plan-added"
                                          : c.type === "plan-removed"
                                            ? "bg-pink-950/30 text-plan-removed"
                                            : "bg-surface text-secondary border border-border"
                                  }`}
                                >
                                  {c.type === "price-up" && `${c.plan} ${c.before} → ${c.after} (+${c.note})`}
                                  {c.type === "price-down" && `${c.plan} ${c.before} → ${c.after} (-${c.note})`}
                                  {c.type === "plan-added" && `${c.plan} added`}
                                  {c.type === "plan-removed" && `${c.plan} removed`}
                                  {c.type === "limit-changed" && `${c.plan} ${c.before} → ${c.after}`}
                                  {c.type === "annual-changed" && `${c.plan} annual ${c.before} → ${c.after}`}
                                  {c.type === "wording-changed" && "Headline changed"}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Errors</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {run.sentry.issues.filter((i) => i.isNew || i.regressed || i.resolved).length === 0 && (
                      <p className="text-sm text-muted">No new or regressed errors.</p>
                    )}
                    {run.sentry.issues
                      .filter((i) => i.isNew || i.regressed || i.resolved)
                      .slice(0, 5)
                      .map((issue) => (
                        <div
                          key={issue.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  issue.isNew ? "bg-sentry-new" : issue.regressed ? "bg-sentry-regressed" : "bg-sentry-resolved"
                                }`}
                              />
                              <p className="text-sm font-medium text-foreground">{issue.title}</p>
                            </div>
                            <p className="mt-1 text-xs text-secondary">
                              {issue.culprit} · {issue.count24h} events · {issue.userCount} users
                            </p>
                          </div>
                          <a
                            href={issue.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            View
                          </a>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </section>

              <aside className="space-y-6">
                {run.digest && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>Digest preview</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground">
                          <p className="font-semibold">{run.digest.title}</p>
                          <p className="mt-1 text-secondary">{run.digest.summary}</p>
                          {run.digest.pricing.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing</p>
                              {run.digest.pricing.map((p) => (
                                <p key={p.slug} className="mt-1 text-secondary">
                                  {p.title}: {p.changes.filter((c) => c.type !== "no-change").map((c) => c.note || c.type).join(", ")}
                                </p>
                              ))}
                            </div>
                          )}
                          {run.digest.errors.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Errors</p>
                              {run.digest.errors.slice(0, 3).map((e) => (
                                <p key={e.id} className="mt-1 text-secondary">
                                  {e.isNew ? "New" : e.regressed ? "Regressed" : "Resolved"}: {e.title}
                                </p>
                              ))}
                            </div>
                          )}
                          {run.digest.quiet.length > 0 && (
                            <p className="mt-3 text-xs text-muted">Quiet: {run.digest.quiet.join(", ")}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {isWaiting && (
                      <ApprovalCard
                        runId={run.id}
                        channel="#night-digest"
                        onApprove={async () => {
                          const res = await fetch(`/api/run/${run.id}/approve`, {
                            method: "POST",
                            credentials: "same-origin",
                          });
                          if (res.status === 401) {
                            router.replace("/login");
                            return;
                          }
                          if (!res.ok) throw new Error("Approve failed");
                          setRun(await res.json());
                        }}
                        onSkip={async (reason) => {
                          const res = await fetch(`/api/run/${run.id}/skip`, {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reason }),
                          });
                          if (res.status === 401) {
                            router.replace("/login");
                            return;
                          }
                          if (!res.ok) throw new Error("Skip failed");
                          setRun(await res.json());
                        }}
                      />
                    )}

                    {isPosted && run.digest.slackPost && (
                      <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-4 text-sm text-emerald-400">
                        <p className="font-medium">Posted</p>
                        <p className="mt-1 text-secondary">
                          {new Date(run.digest.slackPost.postedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {run.digest.slackPost.permalink ? (
                            <a href={run.digest.slackPost.permalink} target="_blank" rel="noreferrer" className="underline">
                              Open in Slack
                            </a>
                          ) : (
                            `#${run.digest.slackPost.channel}`
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
