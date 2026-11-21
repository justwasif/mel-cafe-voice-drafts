import { promises as fs } from "fs";
import path from "path";
import type { PageSnapshot, PageDiff, PagePlan, PageChangeType, PricingResult } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "sample-pricing");
const STATE_FILE = path.join(process.cwd(), "data", "sample-pricing-state.json");
const SCREENSHOTS_DIR = path.join(process.cwd(), "data", "snapshots", "screenshots");

interface PageData {
  slug: string;
  name: string;
  versions: Array<{
    version: number;
    title: string;
    headline: string;
    plans: PagePlan[];
  }>;
}

async function getPageData(slug: string): Promise<PageData> {
  const raw = await fs.readFile(path.join(DATA_DIR, `${slug}.json`), "utf8");
  return JSON.parse(raw) as PageData;
}

async function getCurrentVersion(slug: string): Promise<number> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const state = JSON.parse(raw) as Record<string, number>;
    return state[slug] || 1;
  } catch {
    return 1;
  }
}

export async function fetchPageSnapshot(slug: string): Promise<PageSnapshot> {
  const data = await getPageData(slug);
  const version = await getCurrentVersion(slug);
  const ver = data.versions.find((v) => v.version === version) ?? data.versions[data.versions.length - 1];

  const url = `${process.env.APP_URL || "http://localhost:3008"}/sample-pricing/${slug}`;

  const plans = ver.plans.map((p) => ({
    name: p.name,
    price: p.price,
    priceAnnual: p.priceAnnual,
    seats: p.seats,
    storage: p.storage,
    features: [...p.features],
  }));

  const rawText = `${ver.title}\n${ver.headline}\n${plans.map((p) => `${p.name}: $${p.price ?? "Free"}${p.priceAnnual ? ` (annual $${p.priceAnnual})` : ""} seats=${p.seats ?? "unlimited"} storage=${p.storage ?? "none"}`).join("\n")}`;

  return {
    slug,
    url,
    fetchedAt: new Date().toISOString(),
    title: data.name,
    headline: ver.headline,
    plans,
    rawText,
    screenshotPath: null,
  };
}

export function diffSnapshots(prev: PageSnapshot | null, curr: PageSnapshot): PageDiff {
  if (!prev) {
    return {
      slug: curr.slug,
      title: curr.title,
      thumbnailPath: null,
      changes: [{ type: "no-change", note: "First snapshot — baseline saved" }],
      error: null,
    };
  }

  const changes: PageDiff["changes"] = [];

  // Plans added/removed
  const prevPlanNames = new Set(prev.plans.map((p) => p.name));
  const currPlanNames = new Set(curr.plans.map((p) => p.name));

  for (const name of currPlanNames) {
    if (!prevPlanNames.has(name)) {
      changes.push({ type: "plan-added", plan: name });
    }
  }
  for (const name of prevPlanNames) {
    if (!currPlanNames.has(name)) {
      changes.push({ type: "plan-removed", plan: name });
    }
  }

  // Price/limit changes per plan
  for (const currPlan of curr.plans) {
    const prevPlan = prev.plans.find((p) => p.name === currPlan.name);
    if (!prevPlan) continue;

    if (currPlan.price !== prevPlan.price) {
      const type: PageChangeType = (currPlan.price ?? 0) > (prevPlan.price ?? 0) ? "price-up" : "price-down";
      changes.push({
        type,
        plan: currPlan.name,
        before: prevPlan.price === null ? "Free" : `$${prevPlan.price}`,
        after: currPlan.price === null ? "Free" : `$${currPlan.price}`,
        note: `${Math.abs(((currPlan.price ?? 0) - (prevPlan.price ?? 0)) / (prevPlan.price || 1) * 100).toFixed(0)}%`,
      });
    }

    if (currPlan.priceAnnual !== prevPlan.priceAnnual) {
      changes.push({
        type: "annual-changed",
        plan: currPlan.name,
        before: prevPlan.priceAnnual === null ? "—" : `$${prevPlan.priceAnnual}`,
        after: currPlan.priceAnnual === null ? "—" : `$${currPlan.priceAnnual}`,
      });
    }

    if (currPlan.seats !== prevPlan.seats) {
      changes.push({
        type: "limit-changed",
        plan: currPlan.name,
        before: prevPlan.seats === null ? "unlimited" : `${prevPlan.seats} seats`,
        after: currPlan.seats === null ? "unlimited" : `${currPlan.seats} seats`,
      });
    }
  }

  // Headline/wording change
  if (curr.headline !== prev.headline) {
    changes.push({
      type: "wording-changed",
      before: prev.headline,
      after: curr.headline,
    });
  }

  if (changes.length === 0) {
    changes.push({ type: "no-change" });
  }

  return {
    slug: curr.slug,
    title: curr.title,
    thumbnailPath: null,
    changes,
    error: null,
  };
}

export async function fetchAndDiffWatchlist(watchlist: { slug: string; name: string; url: string }[]): Promise<PricingResult> {
  const snapshots: PageSnapshot[] = [];
  const diffs: PageDiff[] = [];
  const errors: string[] = [];

  for (const entry of watchlist) {
    try {
      const prev = await loadSnapshot(entry.slug);
      const curr = await fetchPageSnapshot(entry.slug);
      await saveSnapshot(entry.slug, curr);
      snapshots.push(curr);
      diffs.push(diffSnapshots(prev, curr));
    } catch (err) {
      errors.push(`${entry.slug}: ${err instanceof Error ? err.message : String(err)}`);
      diffs.push({
        slug: entry.slug,
        title: entry.name,
        thumbnailPath: null,
        changes: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { snapshots, diffs, errors };
}

// Re-export for convenience
async function loadSnapshot(slug: string): Promise<PageSnapshot | null> {
  const { loadSnapshot: ls } = await import("./store");
  return ls(slug);
}

async function saveSnapshot(slug: string, snapshot: PageSnapshot): Promise<void> {
  const { saveSnapshot: ss } = await import("./store");
  return ss(slug, snapshot);
}
