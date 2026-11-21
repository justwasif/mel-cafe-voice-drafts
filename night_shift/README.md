# Night Shift Teammate

An agent with an ongoing job for a small SaaS team. Every night it:

1. **Watches 5 pricing pages** and records what changed (prices, plans, limits, wording).
2. **Tracks open Sentry errors**: new, regressed, still open, resolved, events since last night.
3. Writes a **morning digest**.

The digest is **posted to Slack only after a person approves it** in the app. The agent never posts on its own.

Sample data only: the 5 pricing pages are fake companies' pages served by this app (`/sample-pricing/<slug>`), changed between nights by a script, so we never scrape or name real products. Sentry is the free test project with seeded errors; Slack is the test workspace, channel `#night-digest`.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui + lucide-react
- Vitest for tests
- File-based storage (`data/runs/`, `data/snapshots/`, `data/digests/`, `data/log.json`) — no database
- Single-user sign-in via `APP_PASSWORD` → httpOnly signed cookie
- Pricing reader: fetch + cheerio-style extraction from sample HTML pages
- Sentry REST API (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
- Slack Web API (`SLACK_BOT_TOKEN`), posting only to `SLACK_DIGEST_CHANNEL`
- Gemini (free) for digest wording only; every number, price and error count comes from code
- Port **3008**

## Setup

```bash
cd night_shift
npm install
```

Copy `.env.example` to `.env.local` and fill in:

| Variable | What it is |
|---|---|
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-…`) with `chat:write`, `channels:read`, `channels:history` |
| `SLACK_DIGEST_CHANNEL` | The ONLY channel the app may post to (e.g. `night-digest`) |
| `SENTRY_AUTH_TOKEN` | Auth token (`sntryu_…`) |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Optional; readers auto-discover org/project if empty |
| `SENTRY_DSN` | Only used by the seed script |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Used only for wording; all numbers/links come from code |
| `APP_PASSWORD` / `SESSION_SECRET` | Single-user auth. `SESSION_SECRET` must be ≥16 chars |
| `NIGHT_RUN_TIME` | When the nightly run fires (HH:mm, default `02:00`) |
| `APP_TIMEZONE` | Timezone for scheduling (default `UTC`) |

## Seed sample data

```bash
npm run seed
```

This runs:

- `seed-pricing.mjs` — writes v1 of the 5 sample pricing pages (Quillpad, Notably, Inkwell, Paperline, Briefcase Notes)
- `seed-sentry.mjs` — sends a burst of new errors and reopens an old issue (regression)

To simulate pricing changes between nights:

```bash
npm run change:pricing
```

This advances each page to its next version:
- Quillpad Pro $12 → $15 (+25%)
- Notably drops free plan
- Inkwell Writer seats 5 → 3
- Paperline adds Enterprise plan
- Briefcase Notes unchanged

## Run

```bash
npm run dev     # http://localhost:3008
npm run build   # production build
npm test        # Vitest (28 tests)
```

## Pages (signed in)

- `/` — **Tonight**: latest run and its digest awaiting approval
- `/runs` — every run (status, duration, changes found, posted or not)
- `/runs/[id]` — full run detail with steps, pricing diffs, Sentry issues
- `/watchlist` — the 5 pages with last snapshot info
- `/log` — approvals and posts history

## How it works

### The job (`lib/job.ts`)

1. Scheduler starts run at `NIGHT_RUN_TIME` (timezone) or on "Run now" button.
2. Fetch 5 watchlist pages → extract plans & prices.
3. Compare with last snapshot → page diff (price/limit/plan/wording).
4. Read Sentry open issues → compare with last run → new/regressed/resolved.
5. Build digest (3-line summary + Pricing + Errors + Quiet + Slack Blocks preview).
6. State: "Waiting for approval".

### Approval flow

The Tonight page shows a Slack Block Kit preview + channel `#night-digest`.

- **Approve & post** → post to `#night-digest` exactly once; store ts + permalink. Idempotent.
- **Edit** (text only) or **Skip tonight** (with reason).
- Unapproved digests never reach Slack.
- Digests not approved by 18:00 are marked "Expired, not posted".

### Design tokens

Night ops theme: dark navy `#0B1220`, moon accent `#FACC15`, Inter + JetBrains Mono fonts.

## Known limitations

- Sample pricing pages are fake companies served by this app — no real scraping.
- Slack bot must be invited to `#night-digest`.
- Screenshots use `playwright-core` + local Chrome (not yet implemented).
- No real scheduler persistence across restarts (reschedules on startup).
