# Wholesale Reorder Agent — SPEC

## Goal
For the owner of a small shop (the Northwind Supply Co. dev store). The agent **watches stock** in Shopify,
**charts when each item will run out** from its sales rate, and **drafts supplier purchase orders as PDFs**. A PO is
never sent until the owner clicks **Approve**, and even then nothing is emailed for real: the approved PO goes
to an in-app **Outbox** showing the email that *would* be sent.

Sample data only: the dev store catalogue, seeded fake sales history, fake suppliers (`@example.com`).
**No Airtable.** Data lives in Shopify (stock) and Supabase (history, suppliers, POs).

## Start from the Store Concierge code (don't rebuild what exists)
This folder starts as a copy of B1-01 `store_front` (repo `justwasif/30-projects-`, branch `b1-01-store-concierge`).

**Reuse as-is:**
| File | What it already does |
|---|---|
| `lib/shopify.ts` | `client_credentials` token cache + `shopifyGraphQL()` with retry, `getProducts()` (variants, price, **inventoryQuantity**) |
| `app/page.tsx` | the `NORTHWIND_PRODUCTS` filter (only the 12 store products) and `LOCAL_IMAGES` + `public/products/*.jpg` photos |
| `lib/supabase-admin.ts`, `lib/supabase-server.ts` | server Supabase clients (service role stays server-only) |
| `app/owner/page.tsx` login + `app/api/owner/login` + `scripts/create-owner.mjs` | owner sign-in with Supabase Auth, using `createBrowserClient` from `@supabase/ssr` (cookie session: keep this, it fixed a 401) |
| `scripts/run-migration.mjs` | runs SQL migrations over `SUPABASE_CONNECTION_STRING` (session pooler) |
| `lib/gemini.ts` | Gemini client setup (replace the tools/system prompt) |
| Tailwind theme / `globals.css` | fonts; recolour per DESIGN below |

**Remove:** the storefront, chat widget, customer chat route, refunds/discounts/approval queue, `public/widget.js`,
order-lookup tools, the old `supabase/migrations` tables' app code (leave the old tables in the database untouched;
create new ones with the `ro_` prefix).

**Build new:** everything below.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + lucide; Vitest.
- **Recharts** for charts. **@react-pdf/renderer** for PO PDFs (server-side).
- Shopify Admin GraphQL (dev store, existing app; scopes include `read_products`, `read_inventory`).
- Supabase (Postgres + Auth). Tables prefixed `ro_`, RLS on, only the signed-in owner can read/write; service role
  only on the server.
- Gemini (free) only for **wording**: the one-paragraph "why" note on each PO and the morning summary. All numbers
  (rates, dates, quantities, costs) come from code, never from the model.

## Environment variables
SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_VERSION,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_CONNECTION_STRING,
GEMINI_API_KEY, GEMINI_MODEL, OWNER_EMAIL, OWNER_PASSWORD, STORE_TIMEZONE, STORE_CURRENCY

## Data (Supabase, `ro_` tables)
- `ro_suppliers`: 3 fake suppliers: **Fern & Pine Textiles** (jackets, vests, shirts, pants, shorts; lead time 14 days;
  MOQ 20 units; case pack 5), **Coastline Knit Co.** (tees, sweaters, socks, beanies; lead 10 days; MOQ 24; case 6),
  **Ridgeway Leather** (belts; lead 21 days; MOQ 10; case 2). Emails `orders@<name>.example.com`, fake addresses.
- `ro_supplier_items`: Shopify variant id → supplier, supplier SKU, **unit cost** (≈45% of retail).
- `ro_sales_daily`: **90 days of seeded fake sales** per variant (deterministic seed: weekly pattern + a recent uptick
  on Field Jacket and Base Layer Tee so the demo has items about to run out). Clearly labelled sample data.
- `ro_snapshots`: each stock check (variant, on-hand from Shopify, timestamp).
- `ro_purchase_orders` (`PO-2026-0001`…, supplier, status `draft|approved|rejected`, totals, why-note, pdf path,
  approved_by/at) and `ro_po_lines` (variant, qty, unit cost, line total).
- `ro_outbox`: approved POs as the email that *would* be sent (to, subject, body, PDF link). Never actually sent.
- Seed script `scripts/seed-reorder.mjs` (idempotent; re-running doesn't duplicate).

## The forecast (pure, tested functions in `lib/forecast.ts`)
- Sales rate = exponentially weighted average of the last 28 days (half-life 7 days), units/day.
- **Days of cover** = on-hand ÷ rate. **Run-out date** = today + days of cover (in `STORE_TIMEZONE`).
- **Reorder point** = rate × (supplier lead time + 7 safety days).
- **Status:** `Order now` (on-hand ≤ reorder point), `Watch` (within 7 days of the reorder point), `OK`.
- **Suggested qty** = rate × (lead time + 45 target days) + safety stock − on-hand − already on open/approved POs,
  rounded **up to the case pack**, raised to the **MOQ** if below. Never negative.
- Variants with no sales: status `No sales`, never reordered.

## The agent run ("Check stock")
1. Read on-hand for every Northwind variant from Shopify; save a snapshot.
2. Run the forecast for every variant.
3. Group `Order now` items by supplier; for each supplier, **create or update one draft PO** (never two open drafts
   for the same supplier).
4. Gemini writes the short why-note per PO from the computed facts (e.g. "Field Jacket M sells ~2.1/day and runs out
   Dec 2, before the 14-day lead time…"). If Gemini fails, use a template note.
5. Render the **draft PDF** (watermark "DRAFT, not approved").
6. Write a run log line: "Checked 60 variants · 5 to reorder · 2 draft POs ($2,184.00)".
- Triggered by the **Check stock** button, and on a schedule while the app runs (every 60 min, configurable).

## Approval (owner only)
- PO page: PDF preview, lines (editable qty, re-rounded to case pack, MOQ enforced), totals, why-note, supplier
  details. Buttons **Approve PO** (primary) and **Reject** (with a reason).
- **Approve** → status `approved`, final PDF without watermark, "Approved by <owner> on <date>", PO added to the
  **Outbox** as the email that would go to the supplier. **No email is sent.** Approving twice does nothing new.
- Rejected POs stay visible with the reason; the next check can draft a new one.

## Pages (owner must be signed in for all)
- `/` **Stock watch**: KPI tiles, the run-out chart, the SKU table.
- `/sku/[variantId]`: one item's chart, history, forecast numbers.
- `/pos` and `/pos/[id]`: draft and approved POs with the PDF.
- `/outbox`: what would be emailed.

## DESIGN — follow exactly (operations dashboard that looks great on video)
Use the **product-ui-ux** skill if available. Personality: **calm finance/ops**: precise, numbers first, one accent.

### Tokens
| Token | Value |
|---|---|
| Page bg | `#F6F7F9` |
| Surface | `#FFFFFF`, border `#E5E7EB`, radius 14, shadow `0 1px 2px rgb(0 0 0/.04), 0 8px 24px -12px rgb(0 0 0/.08)` |
| Text | `#111827`; secondary `#4B5563`; muted `#9CA3AF` |
| Accent | navy `#1E3A8A`, hover `#1E40AF`, soft `#EFF4FF` |
| Status | Order now `#B91C1C` on `#FEF2F2` · Watch `#B45309` on `#FFFBEB` · OK `#15803D` on `#F0FDF4` · Draft `#4B5563` on `#F3F4F6` · Approved `#1E3A8A` on `#EFF4FF` |
| Chart | stock line `#1E3A8A`; projected line dashed `#1E3A8A` 60%; reorder point line `#B45309` dashed; run-out marker `#B91C1C`; lead-time band `#FDE68A` at 35% |
| Fonts | Inter (UI, tabular numbers), JetBrains Mono (SKUs, PO numbers) |
| Spacing | 4px grid; page padding 32px; panel padding 20–24px |

### Layout (1440×900)
- **Left sidebar (232px):** logo mark + "Reorder Agent", nav (Stock watch, Purchase orders with a draft-count badge,
  Outbox, Suppliers), and at the bottom the store pill "Northwind Supply Co. · Shopify dev store" with a green dot.
- **Top bar:** page title, "Last check 2 min ago", **Check stock** button (accent, spinner while running), avatar.
- **Stock watch:**
  - 4 KPI tiles: *Items to reorder*, *Running out in 14 days*, *Draft POs* (count + value), *Next run-out* (item + date).
  - **Hero chart** (the signature visual): for the selected item, past 60 days of stock (solid) continuing as a
    dashed projection down to zero, the reorder-point line, a shaded lead-time band ending at the run-out date, a red
    "Runs out Dec 2" marker, and a "PO arrives Nov 30" marker if a PO is approved. Hover tooltip with exact values.
  - **SKU table:** product thumbnail + name + size, supplier, on hand, sales/day, days of cover with a small bar,
    run-out date, status chip, mini sparkline, and "In PO-2026-0003" link when drafted. Sorted by days of cover;
    filter chips (All / Order now / Watch / OK). Clicking a row updates the hero chart.
  - **Agent activity** panel (right or below): timeline of runs ("09:00 Checked 60 variants · 2 drafts created").
- **PO detail:** two columns: left the **PDF preview** (rendered pages, crisp, with DRAFT watermark), right the
  summary card (supplier, lead time, expected arrival, lines with editable qty steppers, subtotal, why-note) and the
  **approval card**: "Approve PO-2026-0003 for $1,254.00?", supplier email it would go to, "Nothing is sent: the
  email goes to the Outbox", **Approve PO** / **Reject**.
- **Outbox:** email-style list; open one to see To/Subject/Body and the attached PDF. Banner "Demo: emails are not sent".
- **The PDF itself:** clean A4: company block, supplier block, PO number (mono), dates (issue, required by), table
  (SKU, item, size, qty, unit cost, total), totals, terms, signature/approval line. Navy header rule, Inter.

### States
Skeletons for tiles/table/chart; "Checking stock…" progress (Reading Shopify → Forecasting → Drafting POs → PDF);
empty state "Nothing to reorder. Next check at 10:00"; error banner with retry (Shopify/Supabase/Gemini failures);
toasts ("Draft PO-2026-0003 created", "PO approved, added to Outbox"). No `alert()`.

### Design QA (before saying done)
Screenshot at 1440×900: Stock watch (with an Order-now item selected), the check running, PO detail with the PDF,
the approval done, Outbox. Score with the product-ui-ux rubric; fix anything below 4/5; show before/after.

## Quality
- zod on all routes; owner session checked server-side on every route; RLS on all `ro_` tables.
- Tests first for: sales-rate/EWMA, days of cover, run-out date in timezone, reorder point, suggested qty (case pack,
  MOQ, on-order subtraction, never negative), one open draft per supplier, approve idempotency, unapproved PO never
  reaches the Outbox, PDF contains the PO number and totals, numbers in the why-note match the computed values.
- README: setup, seed, how the forecast works, limitations (sample sales history, no real email).

## Acceptance checklist (Mel runs and shows each)
1. Seed → Check stock → at least Field Jacket M and Base Layer Tee M are `Order now` with run-out dates; KPI tiles match the table.
2. Draft POs created, grouped by supplier, quantities rounded to case packs and ≥ MOQ; draft PDFs render with watermark.
3. Running Check stock again does not create duplicate drafts.
4. Owner edits a qty → re-rounded; Approve → final PDF, status Approved, Outbox entry; nothing emailed.
5. Signed-out requests to every route return 401.
6. Hero chart shows projection, reorder point, lead-time band and run-out marker for the selected item.
7. Design QA screenshots match the DESIGN section.
8. `npm run build` and tests pass.
