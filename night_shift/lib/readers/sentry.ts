import { env } from "@/lib/env";
import type { SentryIssue, SentryResult } from "@/lib/types";

const BASE = "https://sentry.io/api/0";

let resolvedOrg = env.SENTRY_ORG;
let resolvedProject = env.SENTRY_PROJECT;

async function sentryFetch(path: string, init?: RequestInit) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sentry ${res.status} on ${url}: ${text}`);
  }
  return res.json();
}

async function discoverOrg(): Promise<string> {
  const orgs: Array<{ slug: string; name: string }> = await sentryFetch("/organizations/");
  if (!orgs.length) throw new Error("No Sentry organizations accessible");
  console.warn(`[night-shift] SENTRY_ORG not set; using discovered org: ${orgs[0].slug}`);
  return orgs[0].slug;
}

async function discoverProject(orgSlug: string): Promise<string> {
  const projects: Array<{ slug: string; name: string; platform: string }> =
    await sentryFetch(`/organizations/${orgSlug}/projects/`);
  if (!projects.length) throw new Error(`No projects in Sentry org ${orgSlug}`);
  console.warn(`[night-shift] SENTRY_PROJECT not set; using discovered project: ${projects[0].slug}`);
  return projects[0].slug;
}

async function ensureResolved(): Promise<{ org: string; project: string }> {
  if (!resolvedOrg) resolvedOrg = await discoverOrg();
  if (!resolvedProject) resolvedProject = await discoverProject(resolvedOrg);
  return { org: resolvedOrg, project: resolvedProject };
}

export async function readSentry(since: Date, prevIssues?: SentryIssue[]): Promise<SentryResult> {
  try {
    const { org, project } = await ensureResolved();

    interface SentryApiIssue {
      id: string;
      shortId: string;
      title: string;
      culprit?: string;
      status: string;
      level: string;
      count: string;
      userCount: number;
      firstSeen: string;
      lastSeen: string;
      permalink: string;
    }

    const issues: SentryApiIssue[] = await sentryFetch(
      `/projects/${org}/${project}/issues/?statsPeriod=24h&query=is:unresolved`
    );

    const prevSince = new Date(since.getTime() - 24 * 60 * 60 * 1000);
    const prevMap = new Map(prevIssues?.map((i) => [i.id, i]));

    const resultIssues: SentryIssue[] = [];

    for (const issue of issues) {
      const events24h = Number(issue.count) || 0;

      // Get prev 24h stats for comparison
      const prevStats: Array<[number, number[]]> = await sentryFetch(
        `/organizations/${org}/issues/${issue.id}/stats/?statsPeriod=48h`
      );
      const prev24h = prevStats
        .filter(([ts]) => {
          const d = new Date(ts * 1000);
          return d >= prevSince && d < since;
        })
        .reduce((sum, [, vals]) => sum + (vals[0] || 0), 0);

      const isNew = new Date(issue.firstSeen) >= since;
      const regressed = issue.status === "unresolved" && !isNew && events24h > 0 && prev24h === 0;

      const prevIssue = prevMap.get(issue.id);
      const resolved = prevIssue ? prevIssue.status === "unresolved" && issue.status !== "unresolved" : false;

      resultIssues.push({
        id: issue.id,
        shortId: issue.shortId,
        title: issue.title,
        culprit: issue.culprit || "unknown",
        level: issue.level,
        status: issue.status as "unresolved" | "resolved" | "ignored",
        count24h: events24h,
        countPrev24h: prev24h,
        userCount: issue.userCount,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        permalink: issue.permalink,
        isNew,
        regressed,
        resolved,
      });
    }

    // Also check for issues that were in prevIssues but not in current → resolved
    if (prevIssues) {
      const currentIds = new Set(issues.map((i) => i.id));
      for (const prev of prevIssues) {
        if (!currentIds.has(prev.id) && prev.status === "unresolved") {
          resultIssues.push({ ...prev, resolved: true, status: "resolved" });
        }
      }
    }

    const newCount = resultIssues.filter((i) => i.isNew).length;
    const regressedCount = resultIssues.filter((i) => i.regressed).length;
    const resolvedCount = resultIssues.filter((i) => i.resolved).length;
    const top3 = [...resultIssues]
      .filter((i) => i.status === "unresolved")
      .sort((a, b) => b.count24h - a.count24h)
      .slice(0, 3);

    return { issues: resultIssues, newCount, regressedCount, resolvedCount, top3 };
  } catch (err) {
    return {
      issues: [],
      newCount: 0,
      regressedCount: 0,
      resolvedCount: 0,
      top3: [],
      error: err instanceof Error ? err.message : "Sentry read failed",
    };
  }
}
