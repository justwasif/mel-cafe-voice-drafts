export type Severity = "high" | "medium" | "low";

export type RunStatus =
  | "running"
  | "waiting"
  | "posted"
  | "skipped"
  | "expired"
  | "failed";

export interface PagePlan {
  name: string;
  price: number | null;
  priceAnnual: number | null;
  seats: number | null;
  storage: string | null;
  features: string[];
}

export interface PageSnapshot {
  slug: string;
  url: string;
  fetchedAt: string;
  title: string;
  headline: string;
  plans: PagePlan[];
  rawText: string;
  screenshotPath: string | null;
}

export type PageChangeType =
  | "price-up"
  | "price-down"
  | "plan-added"
  | "plan-removed"
  | "limit-changed"
  | "wording-changed"
  | "annual-changed"
  | "no-change";

export interface PageDiff {
  slug: string;
  title: string;
  thumbnailPath: string | null;
  changes: {
    type: PageChangeType;
    plan?: string;
    before?: string;
    after?: string;
    note?: string;
  }[];
  error: string | null;
}

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  status: "unresolved" | "resolved" | "ignored";
  count24h: number;
  countPrev24h: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  isNew: boolean;
  regressed: boolean;
  resolved: boolean;
}

export interface PricingResult {
  snapshots: PageSnapshot[];
  diffs: PageDiff[];
  errors: string[];
}

export interface SentryResult {
  issues: SentryIssue[];
  newCount: number;
  regressedCount: number;
  resolvedCount: number;
  top3: SentryIssue[];
  error?: string;
}

export interface SlackPost {
  channel: string;
  ts: string;
  permalink: string;
  postedAt: string;
}

export interface Digest {
  id: string;
  runId: string;
  title: string;
  summary: string;
  pricing: PageDiff[];
  errors: SentryIssue[];
  quiet: string[];
  slackBlocks: unknown[];
  slackPost: SlackPost | null;
  approvedAt: string | null;
  skippedAt: string | null;
  skipReason: string | null;
  expiredAt: string | null;
}

export interface RunStep {
  key: string;
  label: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: "pending" | "running" | "done" | "error";
  error: string | null;
}

export interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  steps: RunStep[];
  watchlist: WatchlistEntry[];
  pricing: PricingResult;
  sentry: SentryResult;
  digest: Digest | null;
  error: string | null;
  durationMs: number;
}

export interface WatchlistEntry {
  slug: string;
  name: string;
  url: string;
}

export interface ApprovalLogEntry {
  id: string;
  runId: string;
  action: "approve" | "skip" | "expire";
  reason: string | null;
  at: string;
  result: "success" | "error";
  resultText: string;
  url: string | null;
}

export interface Settings {
  watchlist: WatchlistEntry[];
  nightRunTime: string;
  timezone: string;
}
