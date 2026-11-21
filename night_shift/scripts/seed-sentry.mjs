import dotenv from "dotenv";
import * as Sentry from "@sentry/node";
import { people } from "./people.mjs";

dotenv.config({ path: ".env.local" });

let DSN = process.env.SENTRY_DSN;

async function discoverDsn() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const orgs = await fetch("https://sentry.io/api/0/organizations/", { headers }).then((r) => r.json());
    const org = Array.isArray(orgs) ? orgs[0] : null;
    if (!org) return null;
    const projects = await fetch(`https://sentry.io/api/0/organizations/${org.slug}/projects/`, { headers }).then((r) => r.json());
    const project = Array.isArray(projects) ? projects[0] : null;
    if (!project) return null;
    // Project public DSN: https://publicKey@o0.ingest.sentry.io/projectId
    let key = project.keys?.[0]?.dsn?.public || project.dsn?.public;
    if (!key) {
      const keys = await fetch(`https://sentry.io/api/0/projects/${org.slug}/${project.slug}/keys/`, { headers }).then((r) => r.json());
      key = keys?.[0]?.dsn?.public;
    }
    if (key) {
      console.warn(`[seed-sentry] SENTRY_DSN not set; discovered DSN for ${org.slug}/${project.slug}`);
      return key;
    }
    return null;
  } catch {
    return null;
  }
}

if (!DSN) {
  DSN = await discoverDsn();
}

if (!DSN) {
  console.warn("SENTRY_DSN not set and could not be discovered — skipping Sentry seed");
  process.exit(0);
}

Sentry.init({ dsn: DSN });

const ANCHOR = new Date();
const HOURS_AGO = (n) => new Date(ANCHOR.getTime() - n * 60 * 60 * 1000);

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendEvent(error, user, timestamp) {
  return new Promise((resolve) => {
    Sentry.withScope((scope) => {
      scope.setUser({ id: `u-${people.indexOf(user)}`, email: user.email, username: user.name });
      scope.setTag("seed", "morning-brief");
      scope.setExtra("occurred_at", timestamp.toISOString());
      const eventId = Sentry.captureException(error);
      resolve(eventId);
    });
  });
}

async function hasExistingSeedEvents() {
  // Check if we've already seeded by looking for recent events with our tag.
  // Since the Sentry SDK doesn't easily list events, we use a heuristic:
  // just try to send one and if DSN works, proceed. The real guard is that
  // repeated runs add more events but the brief reader groups by fingerprint.
  return false;
}

async function main() {
  // Idempotency: we can't easily query events back, so we rely on the caller
  // to not re-run excessively. Each run adds events but they're grouped by
  // error message in the Sentry UI.

  // Main checkout CardError issue: 38 events across multiple users in last 12h
  const checkoutUsers = people.filter((p) => p.role === "customer").slice(0, 6);
  let eventsSent = 0;
  while (eventsSent < 38) {
    const user = checkoutUsers[eventsSent % checkoutUsers.length];
    const hoursAgo = randomBetween(1, 12);
    const ts = HOURS_AGO(hoursAgo);
    await sendEvent(
      new Error("CardError: payment_intent_authentication_failure"),
      user,
      ts
    );
    eventsSent++;
  }

  // Two quieter old issues (3 events each)
  const oldErrors = [
    { err: new Error("TypeError: Cannot read properties of undefined (reading 'url')"), label: "type-url" },
    { err: new Error("ReferenceError: featureFlag is not defined"), label: "feature-flag" },
  ];
  for (const { err } of oldErrors) {
    for (let i = 0; i < 3; i++) {
      await sendEvent(err, people[i], HOURS_AGO(randomBetween(18, 23)));
    }
  }

  await Sentry.close(5000);
  console.log(`Seeded Sentry with ${38 + oldErrors.length * 3} events`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
