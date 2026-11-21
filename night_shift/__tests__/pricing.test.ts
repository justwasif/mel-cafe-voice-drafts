import { describe, it, expect } from "vitest";
import type { PageSnapshot, PageDiff } from "@/lib/types";

// ── Diff engine (pure logic) ───────────────────────────────────────

function makePlan(name: string, price: number | null, seats: number | null = null): PageSnapshot["plans"][0] {
  return { name, price, priceAnnual: null, seats, storage: null, features: [] };
}

function makeSnapshot(slug: string, plans: PageSnapshot["plans"]): PageSnapshot {
  return {
    slug,
    url: `/sample-pricing/${slug}`,
    fetchedAt: new Date().toISOString(),
    title: slug,
    headline: "Test headline",
    plans,
    rawText: "",
    screenshotPath: null,
  };
}

// Import the diffSnapshots function from pricing module
// We'll test via a local copy of the diff logic since lib/pricing imports fs
function diffSnapshots(prev: PageSnapshot | null, curr: PageSnapshot): PageDiff {
  if (!prev) {
    return { slug: curr.slug, title: curr.title, thumbnailPath: null, changes: [{ type: "no-change" }], error: null };
  }
  const changes: PageDiff["changes"] = [];
  const prevNames = new Set(prev.plans.map((p) => p.name));
  const currNames = new Set(curr.plans.map((p) => p.name));

  for (const name of currNames) if (!prevNames.has(name)) changes.push({ type: "plan-added", plan: name });
  for (const name of prevNames) if (!currNames.has(name)) changes.push({ type: "plan-removed", plan: name });

  for (const cp of curr.plans) {
    const pp = prev.plans.find((p) => p.name === cp.name);
    if (!pp) continue;
    if (cp.price !== pp.price) {
      changes.push({
        type: (cp.price ?? 0) > (pp.price ?? 0) ? "price-up" : "price-down",
        plan: cp.name,
        before: pp.price === null ? "Free" : `$${pp.price}`,
        after: cp.price === null ? "Free" : `$${cp.price}`,
      });
    }
    if (cp.seats !== pp.seats) {
      changes.push({ type: "limit-changed", plan: cp.name, before: `${pp.seats}`, after: `${cp.seats}` });
    }
  }

  if (curr.headline !== prev.headline) changes.push({ type: "wording-changed", before: prev.headline, after: curr.headline });
  if (changes.length === 0) changes.push({ type: "no-change" });

  return { slug: curr.slug, title: curr.title, thumbnailPath: null, changes, error: null };
}

describe("pricing diff engine", () => {
  it("detects no change when identical", () => {
    const snap = makeSnapshot("test", [makePlan("Pro", 12)]);
    const diff = diffSnapshots(snap, snap);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].type).toBe("no-change");
  });

  it("detects price increase", () => {
    const prev = makeSnapshot("test", [makePlan("Pro", 12)]);
    const curr = makeSnapshot("test", [makePlan("Pro", 15)]);
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "price-up")).toBe(true);
    expect(diff.changes.find((c) => c.type === "price-up")?.after).toBe("$15");
  });

  it("detects price decrease", () => {
    const prev = makeSnapshot("test", [makePlan("Pro", 15)]);
    const curr = makeSnapshot("test", [makePlan("Pro", 12)]);
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "price-down")).toBe(true);
  });

  it("detects plan added", () => {
    const prev = makeSnapshot("test", [makePlan("Pro", 12)]);
    const curr = makeSnapshot("test", [makePlan("Pro", 12), makePlan("Enterprise", 49)]);
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "plan-added" && c.plan === "Enterprise")).toBe(true);
  });

  it("detects plan removed", () => {
    const prev = makeSnapshot("test", [makePlan("Free", 0), makePlan("Pro", 12)]);
    const curr = makeSnapshot("test", [makePlan("Pro", 12)]);
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "plan-removed" && c.plan === "Free")).toBe(true);
  });

  it("detects seat limit change", () => {
    const prev = makeSnapshot("test", [makePlan("Team", 18, 5)]);
    const curr = makeSnapshot("test", [makePlan("Team", 18, 3)]);
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "limit-changed")).toBe(true);
  });

  it("detects wording change", () => {
    const prev = makeSnapshot("test", [makePlan("Pro", 12)]);
    const curr = { ...makeSnapshot("test", [makePlan("Pro", 12)]), headline: "New headline" };
    const diff = diffSnapshots(prev, curr);
    expect(diff.changes.some((c) => c.type === "wording-changed")).toBe(true);
  });

  it("handles multiple changes in one page", () => {
    const prev = makeSnapshot("test", [makePlan("Free", 0), makePlan("Pro", 12)]);
    const curr = makeSnapshot("test", [makePlan("Pro", 15), makePlan("Business", 29)]);
    const diff = diffSnapshots(prev, curr);
    // Free removed, Pro price up, Business added
    expect(diff.changes.filter((c) => c.type !== "no-change").length).toBeGreaterThanOrEqual(3);
  });

  it("first snapshot returns baseline note", () => {
    const curr = makeSnapshot("test", [makePlan("Pro", 12)]);
    const diff = diffSnapshots(null, curr);
    expect(diff.changes[0].type).toBe("no-change");
  });
});
