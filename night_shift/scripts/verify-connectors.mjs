import dotenv from "dotenv";
import { WebClient } from "@slack/web-api";
import { LinearClient } from "@linear/sdk";
import Stripe from "stripe";

// Sentry uses plain fetch because the SDK needs DSN for events

dotenv.config({ path: ".env.local" });

const results = {
  slack: { ok: false, error: null, data: null },
  linear: { ok: false, error: null, data: null },
  stripe: { ok: false, error: null, data: null },
  sentry: { ok: false, error: null, data: null },
};

async function checkSlack() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channels = (process.env.SLACK_CHANNELS || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!token) throw new Error("SLACK_BOT_TOKEN missing");
  const client = new WebClient(token);
  const list = await client.conversations.list({ types: "public_channel,private_channel" });
  const found = list.channels?.filter((c) => channels.includes(c.name)) || [];
  const allNames = list.channels?.map((c) => c.name) || [];
  results.slack = {
    ok: true,
    data: {
      configuredChannels: channels,
      foundChannels: found.map((c) => ({ name: c.name, id: c.id })),
      allChannelNames: allNames,
      missing: channels.filter((name) => !allNames.includes(name)),
    },
  };
}

async function checkLinear() {
  const key = process.env.LINEAR_API_KEY;
  const teamKey = process.env.LINEAR_TEAM_KEY;
  if (!key) throw new Error("LINEAR_API_KEY missing");
  const client = new LinearClient({ apiKey: key });
  const teams = await client.teams();
  const team = teams.nodes.find((t) => t.key === teamKey);
  let states = [];
  let issues = [];
  let activeCycle = null;
  if (team) {
    const statesConn = await team.states();
    states = statesConn.nodes.map((s) => ({ id: s.id, name: s.name, type: s.type }));
    const issuesConn = await client.issues({
      filter: { team: { id: { eq: team.id } } },
      first: 20,
    });
    issues = issuesConn.nodes.map((i) => ({
      identifier: i.identifier,
      title: i.title,
      state: i.state?.name,
      priority: i.priority,
    }));
    const cyclesConn = await team.cycles({ filter: { isActive: { eq: true } } });
    activeCycle = cyclesConn.nodes[0]
      ? { number: cyclesConn.nodes[0].number, progress: cyclesConn.nodes[0].progress }
      : null;
  }
  results.linear = {
    ok: true,
    data: {
      configuredTeamKey: teamKey,
      allTeamKeys: teams.nodes.map((t) => ({ key: t.key, name: t.name })),
      teamFound: !!team,
      states,
      issues,
      activeCycle,
    },
  };
}

async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  const stripe = new Stripe(key);
  const isTest = key.startsWith("sk_test_");
  const charges = await stripe.charges.list({ limit: 10 });
  results.stripe = {
    ok: true,
    data: {
      isTest,
      chargeCount: charges.data.length,
      recentCharges: charges.data.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        paid: c.paid,
        refunded: c.refunded,
        customer: typeof c.customer === "string" ? c.customer : c.customer?.id,
        created: c.created,
      })),
    },
  };
}

async function checkSentry() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  if (!token) throw new Error("SENTRY_AUTH_TOKEN missing");
  const headers = { Authorization: `Bearer ${token}` };
  const url = org
    ? `https://sentry.io/api/0/organizations/${org}/projects/`
    : "https://sentry.io/api/0/organizations/";
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Sentry HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  results.sentry = {
    ok: true,
    data: {
      configuredOrg: org || null,
      projects: Array.isArray(json)
        ? json.map((p) => ({ slug: p.slug, name: p.name, organization: p.organization?.slug }))
        : json,
    },
  };
}

async function main() {
  await Promise.allSettled([
    checkSlack().catch((e) => (results.slack = { ok: false, error: e.message, data: null })),
    checkLinear().catch((e) => (results.linear = { ok: false, error: e.message, data: null })),
    checkStripe().catch((e) => (results.stripe = { ok: false, error: e.message, data: null })),
    checkSentry().catch((e) => (results.sentry = { ok: false, error: e.message, data: null })),
  ]);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
