import { promises as fs } from "fs";
import path from "path";
import type { Run, PageSnapshot, Digest, ApprovalLogEntry, Settings, WatchlistEntry } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const RUNS_DIR = path.join(DATA_DIR, "runs");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const DIGESTS_DIR = path.join(DATA_DIR, "digests");
const LOG_FILE = path.join(DATA_DIR, "log.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

async function ensureDirs() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await fs.mkdir(DIGESTS_DIR, { recursive: true });
}

function runFile(id: string) {
  return path.join(RUNS_DIR, `${id}.json`);
}

function snapshotFile(slug: string) {
  return path.join(SNAPSHOTS_DIR, `${slug}.json`);
}

function digestFile(id: string) {
  return path.join(DIGESTS_DIR, `${id}.json`);
}

// ── Runs ───────────────────────────────────────────────────────────

export async function saveRun(run: Run): Promise<void> {
  await ensureDirs();
  await fs.writeFile(runFile(run.id), JSON.stringify(run, null, 2));
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    const raw = await fs.readFile(runFile(id), "utf8");
    return JSON.parse(raw) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<Run[]> {
  await ensureDirs();
  const files = await fs.readdir(RUNS_DIR);
  const runs: Run[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(RUNS_DIR, file), "utf8");
    runs.push(JSON.parse(raw) as Run);
  }
  return runs.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
}

export async function latestRun(): Promise<Run | null> {
  const runs = await listRuns();
  return runs[0] ?? null;
}

// ── Snapshots ──────────────────────────────────────────────────────

export async function saveSnapshot(slug: string, snapshot: PageSnapshot): Promise<void> {
  await ensureDirs();
  await fs.writeFile(snapshotFile(slug), JSON.stringify(snapshot, null, 2));
}

export async function loadSnapshot(slug: string): Promise<PageSnapshot | null> {
  try {
    const raw = await fs.readFile(snapshotFile(slug), "utf8");
    return JSON.parse(raw) as PageSnapshot;
  } catch {
    return null;
  }
}

// ── Digests ────────────────────────────────────────────────────────

export async function saveDigest(digest: Digest): Promise<void> {
  await ensureDirs();
  await fs.writeFile(digestFile(digest.id), JSON.stringify(digest, null, 2));
}

export async function loadDigest(id: string): Promise<Digest | null> {
  try {
    const raw = await fs.readFile(digestFile(id), "utf8");
    return JSON.parse(raw) as Digest;
  } catch {
    return null;
  }
}

// ── Approval log ───────────────────────────────────────────────────

export async function loadApprovalLog(): Promise<ApprovalLogEntry[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    return JSON.parse(raw) as ApprovalLogEntry[];
  } catch {
    return [];
  }
}

export async function saveApprovalLogEntry(entry: ApprovalLogEntry): Promise<void> {
  await ensureDirs();
  const log = await loadApprovalLog();
  log.push(entry);
  await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Settings ───────────────────────────────────────────────────────

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { slug: "quillpad", name: "Quillpad", url: "/sample-pricing/quillpad" },
  { slug: "notably", name: "Notably", url: "/sample-pricing/notably" },
  { slug: "inkwell", name: "Inkwell", url: "/sample-pricing/inkwell" },
  { slug: "paperline", name: "Paperline", url: "/sample-pricing/paperline" },
  { slug: "briefcase-notes", name: "Briefcase Notes", url: "/sample-pricing/briefcase-notes" },
];

export async function loadSettings(): Promise<Settings> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw) as Settings;
  } catch {
    return {
      watchlist: DEFAULT_WATCHLIST,
      nightRunTime: process.env.NIGHT_RUN_TIME || "02:00",
      timezone: process.env.APP_TIMEZONE || "UTC",
    };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ensureDirs();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
