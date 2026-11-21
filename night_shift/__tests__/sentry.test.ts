import { describe, it, expect } from "vitest";
import type { SentryIssue } from "@/lib/types";

describe("Sentry issue state changes", () => {
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

  it("marks issue as new when firstSeen >= since", () => {
    const since = new Date(Date.now() - 1000);
    const issue = makeIssue({ firstSeen: new Date().toISOString(), isNew: true });
    expect(issue.isNew).toBe(true);
  });

  it("marks issue as regressed when prev24h = 0 and current > 0", () => {
    const issue = makeIssue({ count24h: 5, countPrev24h: 0, isNew: false, regressed: true });
    expect(issue.regressed).toBe(true);
  });

  it("marks issue as resolved when it was unresolved before and now resolved", () => {
    const prev = makeIssue({ status: "unresolved", resolved: false });
    const curr = makeIssue({ status: "resolved", resolved: true });
    expect(curr.resolved).toBe(true);
  });

  it("top3 sorts by count24h descending", () => {
    const issues: SentryIssue[] = [
      makeIssue({ id: "a", count24h: 3 }),
      makeIssue({ id: "b", count24h: 10 }),
      makeIssue({ id: "c", count24h: 7 }),
      makeIssue({ id: "d", count24h: 1 }),
    ];
    const top3 = [...issues].sort((a, b) => b.count24h - a.count24h).slice(0, 3);
    expect(top3[0].id).toBe("b");
    expect(top3[1].id).toBe("c");
    expect(top3[2].id).toBe("a");
  });

  it("counts new/regressed/resolved correctly", () => {
    const issues: SentryIssue[] = [
      makeIssue({ id: "a", isNew: true }),
      makeIssue({ id: "b", isNew: true }),
      makeIssue({ id: "c", regressed: true }),
      makeIssue({ id: "d", resolved: true }),
      makeIssue({ id: "e", resolved: true }),
      makeIssue({ id: "f", resolved: true }),
    ];
    expect(issues.filter((i) => i.isNew).length).toBe(2);
    expect(issues.filter((i) => i.regressed).length).toBe(1);
    expect(issues.filter((i) => i.resolved).length).toBe(3);
  });
});
