import { WebClient } from "@slack/web-api";
import { env } from "@/lib/env";

const client = new WebClient(env.SLACK_BOT_TOKEN);

/**
 * Post a digest message to the configured Slack channel.
 * Guarded to ONLY post to SLACK_DIGEST_CHANNEL.
 */
export async function postDigest(
  text: string,
  blocks?: unknown[]
): Promise<{ ok: boolean; ts?: string; permalink?: string; error?: string }> {
  try {
    const channel = env.SLACK_DIGEST_CHANNEL;

    // Resolve channel ID if needed
    let channelId = channel;
    if (!channel.startsWith("C") && !channel.startsWith("#")) {
      const list = await client.conversations.list({ types: "public_channel", limit: 200 });
      const found = list.channels?.find((c) => c.name === channel);
      if (!found?.id) {
        return { ok: false, error: `Channel #${channel} not found` };
      }
      channelId = found.id;
    }

    const result = await client.chat.postMessage({
      channel: channelId,
      text,
      blocks: blocks as unknown as (Record<string, unknown> & { type: string })[],
      unfurl_links: false,
    });

    if (!result.ok || !result.ts) {
      return { ok: false, error: result.error || "Slack post failed" };
    }

    // Get permalink
    let permalink: string | undefined;
    try {
      const perm = await client.chat.getPermalink({ channel: channelId, message_ts: result.ts });
      permalink = perm.permalink ?? undefined;
    } catch {
      // ignore permalink failure
    }

    return { ok: true, ts: result.ts, permalink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "postDigest failed" };
  }
}

/**
 * Verify the bot can post to the configured channel.
 */
export async function verifySlackChannel(): Promise<{ ok: boolean; error?: string }> {
  try {
    const channel = env.SLACK_DIGEST_CHANNEL;
    const list = await client.conversations.list({ types: "public_channel,private_channel", limit: 200 });
    const found = list.channels?.find((c) => c.name === channel || c.id === channel);
    if (!found) return { ok: false, error: `Channel #${channel} not found` };
    if (!found.is_member) return { ok: false, error: `Bot is not a member of #${channel}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "verifySlackChannel failed" };
  }
}
