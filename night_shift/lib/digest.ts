import type { PageDiff, SentryIssue, Digest, SlackPost } from "./types";

export function buildDigest(
  runId: string,
  diffs: PageDiff[],
  sentry: { issues: SentryIssue[]; newCount: number; regressedCount: number; resolvedCount: number; top3: SentryIssue[] }
): Digest {
  const date = new Date();
  const dateStr = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const changedPages = diffs.filter((d) => d.changes.some((c) => c.type !== "no-change"));
  const unchangedPages = diffs.filter((d) => d.changes.every((c) => c.type === "no-change"));

  const newIssues = sentry.issues.filter((i) => i.isNew);
  const regressedIssues = sentry.issues.filter((i) => i.regressed);
  const resolvedIssues = sentry.issues.filter((i) => i.resolved);
  const activeIssues = sentry.issues.filter((i) => i.status === "unresolved" && !i.isNew && !i.regressed);

  // Summary lines
  const parts: string[] = [];
  if (changedPages.length > 0) {
    parts.push(`${changedPages.length} pricing page${changedPages.length === 1 ? "" : "s"} changed`);
  }
  if (sentry.newCount > 0) {
    parts.push(`${sentry.newCount} new error${sentry.newCount === 1 ? "" : "s"}`);
  }
  if (sentry.regressedCount > 0) {
    parts.push(`${sentry.regressedCount} regressed`);
  }
  if (sentry.resolvedCount > 0) {
    parts.push(`${sentry.resolvedCount} resolved`);
  }

  let summary: string;
  if (parts.length === 0) {
    summary = "Nothing changed tonight. All quiet.";
  } else {
    summary = parts.join(" · ") + ".";
  }

  // Slack Block Kit
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Night shift · ${dateStr}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: summary },
    },
  ];

  if (changedPages.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Pricing changes*` },
    });
    for (const page of changedPages) {
      const lines = page.changes
        .filter((c) => c.type !== "no-change")
        .map((c) => {
          if (c.type === "price-up") return `• ${c.plan}: ${c.before} → ${c.after} (+${c.note})`;
          if (c.type === "price-down") return `• ${c.plan}: ${c.before} → ${c.after} (-${c.note})`;
          if (c.type === "plan-added") return `• ${c.plan} plan added`;
          if (c.type === "plan-removed") return `• ${c.plan} plan removed`;
          if (c.type === "limit-changed") return `• ${c.plan}: ${c.before} → ${c.after}`;
          if (c.type === "annual-changed") return `• ${c.plan} annual: ${c.before} → ${c.after}`;
          if (c.type === "wording-changed") return `• Headline changed`;
          return `• ${c.note || "Changed"}`;
        })
        .join("\n");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${page.title}*\n${lines}` },
      });
    }
  }

  if (newIssues.length > 0 || regressedIssues.length > 0 || resolvedIssues.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Errors*` },
    });
    for (const issue of [...newIssues, ...regressedIssues, ...resolvedIssues].slice(0, 5)) {
      const emoji = issue.isNew ? "🔴" : issue.regressed ? "🟠" : "🟢";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${issue.title}* in \`${issue.culprit}\` · ${issue.count24h} events · <${issue.permalink}|View>`,
        },
      });
    }
  }

  if (unchangedPages.length > 0) {
    const quietNames = unchangedPages.map((p) => p.title).join(", ");
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Quiet tonight: ${quietNames}` }],
    });
  }

  return {
    id: `digest-${runId}`,
    runId,
    title: `Night shift · ${dateStr}`,
    summary,
    pricing: changedPages,
    errors: [...newIssues, ...regressedIssues, ...resolvedIssues],
    quiet: unchangedPages.map((p) => p.title),
    slackBlocks: blocks,
    slackPost: null,
    approvedAt: null,
    skippedAt: null,
    skipReason: null,
    expiredAt: null,
  };
}

export async function postDigestToSlack(digest: Digest): Promise<SlackPost | null> {
  const { postDigest } = await import("./readers/slack");
  const text = digest.summary;
  const result = await postDigest(text, digest.slackBlocks);
  if (!result.ok || !result.ts) return null;
  return {
    channel: process.env.SLACK_DIGEST_CHANNEL || "night-digest",
    ts: result.ts,
    permalink: result.permalink || "",
    postedAt: new Date().toISOString(),
  };
}
