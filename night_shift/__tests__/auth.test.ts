import { describe, it, expect } from "vitest";

describe("auth guards", () => {
  it("APP_PASSWORD exists and is non-empty", () => {
    const pw = process.env.APP_PASSWORD;
    expect(pw).toBeDefined();
    expect(pw?.length).toBeGreaterThan(0);
  });

  it("SESSION_SECRET is at least 16 chars", () => {
    const secret = process.env.SESSION_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBeGreaterThanOrEqual(16);
  });

  it("SLACK_DIGEST_CHANNEL is set", () => {
    const channel = process.env.SLACK_DIGEST_CHANNEL;
    expect(channel).toBe("night-digest");
  });

  it("SENTRY_PROJECT is error-to-fix", () => {
    const project = process.env.SENTRY_PROJECT;
    expect(project).toBe("error-to-fix");
  });
});
