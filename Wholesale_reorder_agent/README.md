# Wholesale Reorder Agent

Watches stock in a Shopify dev store, forecasts when each item will run out from its sales rate, and drafts supplier purchase orders as PDFs that the owner approves. Nothing is emailed for real — approved POs go to an in-app Outbox showing the email that *would* be sent.

## Features

- **Stock watch** (`/`) — KPI tiles, a hero chart showing past stock + projected run-out + reorder point + lead-time band, and a SKU table sorted by days of cover with status chips and filter chips.
- **Purchase orders** (`/pos`, `/pos/[id]`) — draft POs grouped by supplier, each with a PDF preview (watermarked "DRAFT"), editable line quantities (re-rounded to case pack, MOQ enforced), and an approval card. Approve → final PDF, status Approved, Outbox entry. Reject → stays visible with reason.
- **Outbox** (`/outbox`) — email-style list of approved POs showing the To/Subject/Body and attached PDF. Banner: "Demo: emails are not sent."
- **Suppliers** (`/suppliers`) — the 3 fake suppliers with lead times, MOQs, and case packs.
- **Agent run** — the "Check stock" button fetches live Shopify inventory, saves snapshots, runs the forecast, creates or updates one draft PO per supplier, generates PDFs, and writes a run log line.

## How the forecast works

All forecast logic lives in `lib/forecast.ts` as pure, tested functions:

- **Sales rate** — exponentially weighted moving average of the last 28 days (half-life 7 days), units/day.
- **Days of cover** — on-hand ÷ rate.
- **Run-out date** — today + ceil(days of cover), in `STORE_TIMEZONE`.
- **Reorder point** — rate × (supplier lead time + 7 safety days).
- **Status** — `Order now` (on-hand ≤ reorder point), `Watch` (within 7 days-of-rate of the reorder point), `OK`, or `No sales` (never reordered).
- **Suggested qty** — rate × (lead + 45 target days) + reorder point − on-hand − on-order, rounded up to the case pack, raised to the MOQ if below, never negative.

Gemini (free tier) is used only for wording — the one-paragraph "why" note on each PO and the morning summary. All numbers come from code, never from the model. If Gemini fails, a template note is used.

## Tech stack

- Next.js 16 (App Router, Turbopack, Cache Components, Partial Prerendering)
- TypeScript + Tailwind CSS v4
- Supabase (Postgres + Auth, `ro_`-prefixed tables, RLS)
- Shopify Admin GraphQL API (client-credentials token cache)
- Recharts (charts), @react-pdf/renderer (PO PDFs)
- Google Gemini (wording only)
- Vitest/Jest (tests)

## Environment variables

All keys live in `.env.local`:

```
SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_VERSION
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_CONNECTION_STRING
GEMINI_API_KEY, GEMINI_MODEL
OWNER_EMAIL, OWNER_PASSWORD
STORE_TIMEZONE, STORE_CURRENCY
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the database migration (creates `ro_`-prefixed tables with RLS):
   ```bash
   npm run db:run supabase/migrations/003_reorder_agent.sql
   ```

3. Create the owner user in Supabase Auth (if not already created):
   ```bash
   npm run db:create-owner
   ```

4. Seed suppliers, supplier items, and 90 days of fake sales history:
   ```bash
   npm run seed:reorder
   ```
   This fetches the 12 Northwind products from Shopify, maps each variant to a supplier, and inserts deterministic fake sales (weekly pattern + a recent uptick on Field Jacket and Base Layer Tee so the demo has items about to run out). Idempotent — re-running upserts suppliers and skips variants that already have sales.

5. Run the dev server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000), sign in with the owner credentials, and click **Check stock**.

## Tests

```bash
npm test
```

36 tests covering: EWMA sales rate, days of cover, run-out date in timezone, reorder point, status classification, case-pack rounding, MOQ enforcement, on-order subtraction, one open draft per supplier, approve idempotency, unapproved PO never reaches Outbox, PDF content, and auth 401 contract.

## Build

```bash
npm run build
```

## Limitations

- **Sample sales history** — the 90 days of sales are seeded fake data with a deterministic pattern. Real sales history would come from Shopify orders.
- **No real email** — approved POs go to the in-app Outbox. No email is sent to any supplier.
- **Fake suppliers** — all supplier addresses and emails are `@example.com` fictional entries.
- **One draft per supplier** — the agent creates or updates a single draft PO per supplier on each run; re-running Check stock does not create duplicates.
