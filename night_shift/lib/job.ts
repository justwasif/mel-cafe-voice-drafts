import type { Run, RunStep, RunStatus, WatchlistEntry } from "./types";
import { loadSettings, saveRun, latestRun, saveDigest } from "./store";
import { fetchAndDiffWatchlist } from "./pricing";
import { readSentry } from "./readers/sentry";
import { buildDigest, postDigestToSlack } from "./digest";

let isRunning = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function getIsRunning(): boolean {
  return isRunning;
}

function makeSteps(): RunStep[] {
  return [
    { key: "fetch", label: "Fetch pages", startedAt: null, finishedAt: null, status: "pending", error: null },
    { key: "extract", label: "Extract plans & prices", startedAt: null, finishedAt: null, status: "pending", error: null },
    { key: "compare", label: "Compare with last snapshot", startedAt: null, finishedAt: null, status: "pending", error: null },
    { key: "sentry", label: "Read Sentry", startedAt: null, finishedAt: null, status: "pending", error: null },
    { key: "digest", label: "Write digest", startedAt: null, finishedAt: null, status: "pending", error: null },
  ];
}

function updateStep(steps: RunStep[], key: string, status: RunStep["status"], error?: string): RunStep[] {
  return steps.map((s) => {
    if (s.key !== key) return s;
    const now = new Date().toISOString();
    return {
      ...s,
      status,
      startedAt: s.startedAt ?? now,
      finishedAt: status === "done" || status === "error" ? now : s.finishedAt,
      error: error ?? s.error,
    };
  });
}

export async function executeRun(manual = false): Promise<Run> {
  if (isRunning) {
    throw new Error("A run is already in progress");
  }
  isRunning = true;

  const settings = await loadSettings();
  const watchlist = settings.watchlist;

  const runId = `run-${Date.now()}`;
  let run: Run = {
    id: runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    steps: makeSteps(),
    watchlist,
    pricing: { snapshots: [], diffs: [], errors: [] },
    sentry: { issues: [], newCount: 0, regressedCount: 0, resolvedCount: 0, top3: [] },
    digest: null,
    error: null,
    durationMs: 0,
  };

  try {
    // Step: fetch + extract + compare
    run.steps = updateStep(run.steps, "fetch", "running");
    await saveRun(run);

    const pricing = await fetchAndDiffWatchlist(watchlist);
    run.pricing = pricing;
    run.steps = updateStep(run.steps, "fetch", "done");
    run.steps = updateStep(run.steps, "extract", "done");
    run.steps = updateStep(run.steps, "compare", "done");
    await saveRun(run);

    // Step: Sentry
    run.steps = updateStep(run.steps, "sentry", "running");
    await saveRun(run);

    const lastRun = await latestRun();
    const lastSentryIssues = lastRun?.sentry?.issues;
    // Use last run start time as "since" for new/regressed detection
    const since = lastRun ? new Date(lastRun.startedAt) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentryResult = await readSentry(since, lastSentryIssues);
    run.sentry = sentryResult;
    run.steps = updateStep(run.steps, "sentry", sentryResult.error ? "error" : "done", sentryResult.error ?? undefined);
    await saveRun(run);

    // Step: digest
    run.steps = updateStep(run.steps, "digest", "running");
    await saveRun(run);

    const digest = buildDigest(runId, pricing.diffs, sentryResult);
    run.digest = digest;
    await saveDigest(digest);
    run.steps = updateStep(run.steps, "digest", "done");

    run.status = "waiting";
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    await saveRun(run);

    return run;
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    await saveRun(run);
    throw err;
  } finally {
    isRunning = false;
  }
}

export async function approveRun(runId: string): Promise<Run> {
  const run = await latestRun();
  if (!run || run.id !== runId) {
    throw new Error("Run not found");
  }
  if (run.status !== "waiting") {
    // Idempotent: already posted
    if (run.status === "posted" && run.digest?.slackPost) {
      return run;
    }
    throw new Error(`Cannot approve run in status ${run.status}`);
  }

  if (!run.digest) {
    throw new Error("No digest to post");
  }

  const post = await postDigestToSlack(run.digest);
  if (!post) {
    throw new Error("Failed to post to Slack");
  }

  run.digest.slackPost = post;
  run.digest.approvedAt = new Date().toISOString();
  run.status = "posted";
  await saveDigest(run.digest);
  await saveRun(run);

  // Log
  const { saveApprovalLogEntry } = await import("./store");
  await saveApprovalLogEntry({
    id: crypto.randomUUID(),
    runId: run.id,
    action: "approve",
    reason: null,
    at: new Date().toISOString(),
    result: "success",
    resultText: `Posted to #${post.channel}`,
    url: post.permalink || null,
  });

  return run;
}

export async function skipRun(runId: string, reason?: string): Promise<Run> {
  const { loadRun, saveApprovalLogEntry } = await import("./store");
  const run = await loadRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "waiting") {
    throw new Error(`Cannot skip run in status ${run.status}`);
  }

  run.status = "skipped";
  if (run.digest) {
    run.digest.skippedAt = new Date().toISOString();
    run.digest.skipReason = reason || "Skipped by user";
    await saveDigest(run.digest);
  }
  await saveRun(run);

  await saveApprovalLogEntry({
    id: crypto.randomUUID(),
    runId: run.id,
    action: "skip",
    reason: reason || null,
    at: new Date().toISOString(),
    result: "success",
    resultText: "Skipped",
    url: null,
  });

  return run;
}

export async function expireRun(runId: string): Promise<Run> {
  const { loadRun, saveApprovalLogEntry } = await import("./store");
  const run = await loadRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "waiting") return run;

  run.status = "expired";
  if (run.digest) {
    run.digest.expiredAt = new Date().toISOString();
    await saveDigest(run.digest);
  }
  await saveRun(run);

  await saveApprovalLogEntry({
    id: crypto.randomUUID(),
    runId: run.id,
    action: "expire",
    reason: "Expired at 18:00",
    at: new Date().toISOString(),
    result: "success",
    resultText: "Expired, not posted",
    url: null,
  });

  return run;
}

// ── Scheduler ──────────────────────────────────────────────────────

export function startScheduler() {
  if (timer) clearTimeout(timer);
  scheduleNext();
}

export function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

async function scheduleNext() {
  const settings = await loadSettings();
  const [hourStr, minStr] = settings.nightRunTime.split(":");
  const targetHour = parseInt(hourStr, 10);
  const targetMin = parseInt(minStr, 10);

  const now = new Date();
  let target = new Date();
  target.setHours(targetHour, targetMin, 0, 0);

  if (target <= now) {
    // Target time already passed today → schedule for tomorrow
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();
  console.log(`[night-shift] Next run scheduled for ${target.toISOString()} (in ${Math.round(delay / 1000 / 60)} min)`);

  timer = setTimeout(async () => {
    try {
      // Check if we missed a run (e.g. app was down)
      const last = await latestRun();
      const lastRunDate = last ? new Date(last.startedAt).toDateString() : null;
      const todayStr = new Date().toDateString();

      if (lastRunDate !== todayStr) {
        console.log("[night-shift] Running scheduled night shift...");
        await executeRun();
      }
    } catch (err) {
      console.error("[night-shift] Scheduled run failed:", err);
    }
    scheduleNext();
  }, delay);
}
