# Night Shift Teammate — SPEC

## Goal
An agent with an **ongoing job** for a small SaaS team (sample company **Lumen Notes**, fake). Every night it:
1. **Watches 5 pricing pages** and records what changed (prices, plans, limits, wording).
2. **Tracks open Sentry errors**: new, regressed, still open, resolved, events since last night.
3. Writes a **morning digest**.
The digest is **posted to Slack only after a person approves it** in the app. The agent never posts on its own.

Sample data only: the 5 pricing pages are **fake companies' pages served by this app** (`/sample-pricing/<slug>`),
changed between nights by a script, so we never scrape or name real products. Sentry is the free test project with
seeded errors; Slack is the test workspace, channel `#night-digest`.

## Start from the Morning Brief code (don't rebuild what exists)
This folder is a copy of `morning_brief/` (B1-03, branch `b1-03-morning-brief`). **Reuse:**
| File | Reuse for |
|---|---|
| `lib/readers/sentry.ts` | Sentry issues + 24 h/prev 24 h stats (extend to "since last run") |
| `lib/readers/slack.ts` | Slack client **with the sandbox-channel guard**: now locked to `SLACK_DIGEST_CHANNEL` |
| `lib/session.ts`, `app/login`, `app/api/auth` | single-user sign-in with `APP_PASSWORD` cookie |
| `lib/store.ts` | JSON file store (`data/`) |
| `components/approval-card.tsx`, `building-state.tsx`, `top-strip.tsx`, `timeline.tsx`, `ui/*` | approval card, run progress, header, timeline |
| `lib/env.ts`, `lib/types.ts`, Gemini setup in `lib/brief.ts` | env validation, types, wording-only Gemini |
| `scripts/seed-sentry.mjs`, `scripts/people.mjs` | seeding errors with fake users |
**Remove:** the Linear and Stripe readers and seeds, the Morning Brief page/story cards/actions not used here,
`seed-slack.mjs`, `seed-linear.mjs`, `seed-stripe.mjs`.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + lucide + Recharts; Vitest. Port **3008**.
- Page watching: `fetch` + `cheerio` (pages are plain HTML), normalised text + structured price extraction; a
  screenshot per page with `playwright-core` + local Chrome (`/etc/profiles/per-user/juswasif/bin/google-chrome`)
  for the visual diff thumbnail.
- **Sentry** REST API (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`), `@sentry/node` + `SENTRY_DSN` for
  the seed only.
- **Slack** Web API (`SLACK_BOT_TOKEN`), posting only to `SLACK_DIGEST_CHANNEL` (code guard + test).
- **Gemini** (free) for digest wording only; every number, price and error count comes from code.
- Storage: `data/` JSON (`runs/`, `snapshots/`, `digests/`, `log.json`). No database.

## Environment variables
GEMINI_API_KEY, GEMINI_MODEL, SLACK_BOT_TOKEN, SLACK_DIGEST_CHANNEL (night-digest), SENTRY_AUTH_TOKEN, SENTRY_ORG,
SENTRY_PROJECT, SENTRY_DSN, APP_URL (http://localhost:3008), APP_TIMEZONE, APP_PASSWORD, SESSION_SECRET,
NIGHT_RUN_TIME (02:00)

## The job (`lib/job.ts`)
- **Watchlist** (editable in Settings, max 5): seeded with 5 sample pages: **Quillpad, Notably, Inkwell, Paperline, Briefcase Notes** (all fake, served from `app/sample-pricing/[slug]`, content in
  `data/sample-pricing/<slug>/v<N>.json`).
- **Schedule:** a scheduler inside the app runs the job every night at `NIGHT_RUN_TIME` (`APP_TIMEZONE`), plus a
  **Run now** button. One run at a time (lock); a missed night runs once at start-up.
- **Run steps** (shown live): Fetch 5 pages → Extract plans & prices → Compare with last snapshot → Read Sentry →
  Compare with last run → Write digest → **Waiting for approval**.
- **Pricing diff** per page: plan added/removed, price change (old → new, %), limit change (e.g. seats 5 → 3),
  annual discount change, headline/wording change (short text diff). No change → "No change".
- **Sentry**: open unresolved issues with counts; **new since last run**, **regressed**, **resolved**, top 3 by
  events in the last 24 h, users affected. Links to the Sentry issue.
- **Digest** (draft): title "Night shift · Thu 20 Nov", 3-line summary, "Pricing" section (only pages that changed,
  each one line with old → new), "Errors" section (new/regressed first), "Quiet" line for unchanged items. Slack
  Block Kit preview.
- Each run is stored with its timings, inputs and outputs; the **Runs** page lists every night.

## Approval (the only way anything reaches Slack)
- The digest card: Slack preview exactly as it will look, the channel (`#night-digest`), **Approve & post**
  (primary), **Edit** (text only; numbers locked), **Skip tonight's** (with reason).
- **Approve** → post to `SLACK_DIGEST_CHANNEL` → store message ts + permalink → "Posted 07:42 · Open in Slack".
  Idempotent (approving twice posts once). Unapproved digests are never posted; a test proves it.
- Digests not approved by 18:00 are marked "Expired, not posted".

## Seed / demo scripts
- `scripts/seed-pricing.mjs` writes v1 of the 5 pages. `scripts/change-pricing.mjs` moves to the next version with
  realistic changes (Quillpad Pro $12 → $15; Notably drops its free plan; Inkwell team seats 5 → 3; Paperline adds
  "Enterprise"; Briefcase unchanged). Idempotent per version.
- `scripts/seed-sentry.mjs` (reused): sends a burst of a new error (`TypeError: Cannot read properties of undefined
  (reading 'syncToken')` in `/api/sync`, 25 events, 12 fake users) and re-opens one old issue (regression).
- Demo story: night 1 baseline → change pricing + new errors → night 2 run → digest → approve → Slack.

## Pages (signed in)
- `/` **Tonight**: the latest run and its digest awaiting approval.
- `/runs` every run (status, duration, changes found, posted or not), `/runs/[id]` the full run.
- `/watchlist` the 5 pages with last snapshot thumbnail, last change, next check.
- `/log` approvals and posts.

## DESIGN — follow exactly
Use the **product-ui-ux** skill if available. Personality: **night ops, calm**: dark navy, moon accent, readable.
No logos of other products: Slack/Sentry shown as lucide icons + words (`MessageSquare` Slack, `Bug` Sentry).

### Tokens
| Token | Value |
|---|---|
| Page bg | `#0B1220` (night navy); panels `#111A2E`, border `#1E2A44`, radius 14 |
| Text | `#E6EAF2`; secondary `#9AA6BF`; muted `#5B6884` |
| Accent | moon `#FACC15` (primary buttons, highlights), hover `#EAB308`, soft `rgba(250,204,21,.12)` |
| Change colours | price up `#F87171` · price down `#34D399` · plan added `#60A5FA` · removed `#F472B6` · no change `#5B6884` |
| Sentry severity | new `#F87171` · regressed `#FB923C` · resolved `#34D399` |
| Status | running `#60A5FA` · waiting approval `#FACC15` · posted `#34D399` · skipped/expired `#5B6884` |
| Fonts | **Inter** (tabular numbers); diffs/IDs **JetBrains Mono** |
| Spacing | 4px grid, page padding 32px |

### Layout (1440×900)
- **Sidebar (232px):** moon mark + "Night Shift", nav (Tonight, Runs, Watchlist, Log), bottom: "Next run 02:00 ·
  in 6h 12m" and "Test workspace" badge.
- **Tonight:** header "Last night's shift · finished 02:04 · 3 changes, 2 new errors".
  Left (60%): the **night timeline** (signature visual): a horizontal line from 02:00 to 02:04 with each step as a
  node lighting up (fetch → compare → Sentry → digest), below it two sections: **Pricing changes** (cards with the page
  thumbnail, old → new price with arrow and %, change chips) and **Errors** (new/regressed rows with event sparkline,
  users, link). Right (40%): the **digest card** as a Slack-style preview, then the **approval card**: "Post this
  digest to #night-digest?" **Approve & post** / **Edit** / **Skip**.
- **Runs:** table of nights: date, duration, changes, errors new/resolved, status chip; a small bar chart of
  changes per night.
- **Running state:** the timeline animates live while a run is in progress (Run now).

### States
Skeletons; "First run: baseline saved, nothing to compare yet"; page unreachable (row shows the error, run
continues); Sentry/Slack/Gemini errors with retry; "Nothing changed tonight" digest; toasts. No `alert()`.

### Design QA (before saying done)
Screenshot at 1440×900: a run in progress, Tonight with changes + digest awaiting approval, approval done with
the Slack link, Runs list, Watchlist. Score with the product-ui-ux rubric, fix anything below 4/5, before/after.

## Quality
- zod on routes, Sentry responses and the extracted price data; session checked server-side on every route.
- Tests first: price extraction, diff rules (each change type, no change), Sentry new/regressed/resolved since last
  run, schedule (time zone, missed night, one run at a time), digest numbers match the computed data, **no Slack post
  without approval**, approve idempotency, Slack locked to `#night-digest`, tokens never sent to the browser.
- README: setup, seed, how the schedule works, limitations (sample pages, test workspace).

## Acceptance checklist (Mel runs and shows each)
1. Seed pricing v1 + Run now → baseline saved.
2. Change pricing + seed Sentry burst → Run now → 4 page changes (1 unchanged) and the new + regressed errors found
   (check with the Sentry connector).
3. Digest waiting for approval; nothing in Slack yet (check with the Slack connector).
4. Approve & post → exactly one message in `#night-digest` (Slack connector); approving again posts nothing.
5. The scheduled run fires at `NIGHT_RUN_TIME` (shown in the Runs list after the real night).
6. Slack post to another channel is refused; signed-out routes return 401.
7. Design QA screenshots match the DESIGN section; `npm run build` and tests pass.
