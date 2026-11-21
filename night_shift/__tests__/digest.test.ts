import { describe, it, expect } from "vitest";
import type { PageDiff, SentryIssue } from "@/lib/types";

// Import buildDigest from lib/digest
import { buildDigest } from "@/lib/digest";

describe("digest builder", () => {
  function makeDiff(slug: string, changes: PageDiff["changes"]): PageDiff {
    return { slug, title: slug, thumbnailPath: null, changes, error: null };
  }

  function makeIssue(overrides: Partial<SentryIssue> = {}): SentryIssue {
    return {
      id: "1",
      shortId: "TEST-1",
      title: "TypeError",
      culprit: "/api/test",
      level: "error",
      status: "unresolved",
      count24h: 5,
      countPrev24h: 0,
      userCount: 2,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      permalink: "https://sentry.io",
      isNew: false,
      regressed: false,
      resolved: false,
      ...overrides,
    };
  }

  it("includes pricing changes in digest", () => {
    const diffs: PageDiff[] = [
      makeDiff("quillpad", [{ type: "price-up", plan: "Pro", before: "$12", after: "$15", note: "25%" }]),
      makeDiff("inkwell", [{ type: "limit-changed", plan: "Writer", before: "5 seats", after: "3 seats" }]),
      makeDiff("briefcase", [{ type: "no-change" }]),
    ];
    const sentry = { issues: [], newCount: 0, regressedCount: 0, resolvedCount: 0, top3: [] };
    const digest = buildDigest("run-1", diffs, sentry);

    expect(digest.pricing.length).toBe(2);
    expect(digest.quiet).toContain("briefcase");
    expect(digest.summary).toContain("2 pricing pages changed");
  });

  it("includes errors in digest", () => {
    const diffs: PageDiff[] = [makeDiff("briefcase", [{ type: "no-change" }])];
    const sentry = {
      issues: [
        makeIssue({ id: "a", isNew: true, title: "New error" }),
        makeIssue({ id: "b", regressed: true, title: "Regressed error" }),
      ],
      newCount: 1,
      regressedCount: 1,
      resolvedCount: 0,
      top3: [],
    };
    const digest = buildDigest("run-1", diffs, sentry);

    expect(digest.errors.length).toBe(2);
    expect(digest.summary).toContain("1 new error");
    expect(digest.summary).toContain("1 regressed");
  });

  it("includes resolved errors", () => {
    const diffs: PageDiff[] = [];
    const sentry = {
      issues: [makeIssue({ id: "a", resolved: true, status: "resolved" })],
      newCount: 0,
      regressedCount: 0,
      resolvedCount: 1,
      top3: [],
    };
    const digest = buildDigest("run-1", diffs, sentry);

    expect(digest.errors.length).toBe(1);
    expect(digest.summary).toContain("1 resolved");
  });

  it("says all quiet when nothing changed", () => {
    const diffs: PageDiff[] = [makeDiff("a", [{ type: "no-change" }])];
    const sentry = { issues: [], newCount: 0, regressedCount: 0, resolvedCount: 0, top3: [] };
    const digest = buildDigest("run-1", diffs, sentry);

    expect(digest.summary).toContain("Nothing changed tonight");
    expect(digest.pricing.length).toBe(0);
    expect(digest.errors.length).toBe(0);
  });

  it("generates Slack Block Kit blocks", () => {
    const diffs: PageDiff[] = [makeDiff("quillpad", [{ type: "price-up", plan: "Pro", before: "$12", after: "$15", note: "25%" }])];
    const sentry = { issues: [makeIssue({ id: "a", isNew: true })], newCount: 1, regressedCount: 0, resolvedCount: 0, top3: [] };
    const digest = buildDigest("run-1", diffs, sentry);

    expect(digest.slackBlocks.length).toBeGreaterThan(0);
    expect(digest.slackBlocks[0]).toMatchObject({ type: "header" });
  });

  it("digest id links to run id", () => {
    const digest = buildDigest("run-123", [], { issues: [], newCount: 0, regressedCount: 0, resolvedCount: 0, top3: [] });
    expect(digest.runId).toBe("run-123");
    expect(digest.id).toBe("digest-run-123");
  });
});
