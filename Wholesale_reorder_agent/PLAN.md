# Wholesale Reorder Agent — Implementation Plan

## 1. Starting point

The existing Store Concierge source is available at `/home/juswasif/Documents/work/mel/wholesale_reorder`. The current working directory (`/home/juswasif/Documents/work/mel/Wholesale_reorder_agent`) only contains `.env.local` and `SPEC.md`, so the first step is to copy that codebase in and transform it.

## 2. What we keep, remove, and build

### Keep as-is (per SPEC.md)

| File | Why we keep it |
|------|----------------|
| `lib/shopify.ts` | Already has `client_credentials` token cache, `shopifyGraphQL()` with retry, and `getProducts()` returning variants, price, and `inventoryQuantity`. |
| `app/page.tsx` | Contains the `NORTHWIND_PRODUCTS` filter (12 products) and `LOCAL_IMAGES` map plus `public/products/*.jpg`. |
| `lib/supabase-admin.ts` | Service-role Supabase client, server-only. |
| `lib/supabase-server.ts` | Cookie-based SSR Supabase client (the fix that resolved 401s). |
| `app/owner/page.tsx` | Owner sign-in UI using `createBrowserClient` from `@supabase/ssr`. |
| `app/api/owner/login/route.ts` | Server-side owner login route. |
| `scripts/create-owner.mjs` | Creates the owner user via Supabase Auth Admin API. |
| `scripts/run-migration.mjs` | Runs SQL migrations over `SUPABASE_CONNECTION_STRING`. |
| `tsconfig.json`, `jest.config.js`, `jest.setup.js`, Tailwind setup | Tooling and test harness. |

### Remove

- Storefront UI and customer flows: `app/storefront-client.tsx`, `app/api/products/route.ts`, `public/widget.js`, the old home-page grid.
- Chat widget and concierge route: `app/api/chat/route.ts`, `lib/tools.ts`, `lib/logic.ts`, `lib/approval.ts`, `app/api/approval-status/route.ts`, `app/api/owner/approve/route.ts`, `app/api/owner/reject/route.ts`, `app/api/owner/requests/route.ts`.
- Old `__tests__/tools.test.ts` (concierge-tool tests).
- Old Store Concierge-specific public assets (`window.svg`, `globe.svg`, etc.) and unused scripts (`seed-shopify.mjs`, `seed-images.mjs` are not needed for this project).
- Old Supabase migrations' *app code* (we leave the old tables in the database untouched; new tables use the `ro_` prefix).

### Build new

| Area | Files / routes |
|------|----------------|
| Database | `supabase/migrations/003_reorder_agent.sql` |
| Seed data | `scripts/seed-reorder.mjs` |
| Forecast maths | `lib/forecast.ts` + `__tests__/forecast.test.ts` |
| Agent run | `app/api/agent/run/route.ts`, `lib/agent.ts` |
| Shopify stock sync | `lib/shopify.ts` additions for inventory snapshots |
| Data access | `lib/db.ts` (Supabase queries for `ro_*` tables) |
| PDF POs | `lib/po-pdf.tsx`, `app/api/pos/[id]/pdf/route.ts` |
| Gemini wording | `lib/gemini.ts` rewritten for PO why-notes and morning summary |
| Pages | `/`, `/sku/[variantId]`, `/pos`, `/pos/[id]`, `/outbox` under `app/` |
| Layout / nav | `app/layout.tsx` owner shell, `components/sidebar.tsx`, `components/topbar.tsx` |
| Dashboard components | `components/kpi-tiles.tsx`, `components/hero-chart.tsx`, `components/sku-table.tsx`, `components/agent-activity.tsx`, `components/po-detail.tsx`, `components/outbox-list.tsx` |
| Shared UI | `components/status-chip.tsx`, `components/ui/*` (button, badge, skeleton, toast, etc.) |
| Tests | `__tests__/forecast.test.ts`, `__tests__/agent.test.ts`, `__tests__/po.test.ts`, `__tests__/auth.test.ts` |

## 3. Real Shopify catalogue (verified capability)

A direct network fetch to Shopify from this shell timed out (network environment), but the existing `lib/shopify.ts::getProducts()` already returns everything the spec needs:

- `product.id`, `product.title`, `product.description`, `product.featuredImage.url`
- Variants: `id`, `title`, `price`, `inventoryQuantity`, `selectedOptions` (size)

The agent will filter to the same 12 `NORTHWIND_PRODUCTS` list already in `app/page.tsx`. Variant inventory is the single `inventoryQuantity` value per variant (Store Concierge already reads this). No extra locations/levels API is required for the dev store.

## 4. Real Supabase schema (verified)

Connected via `SUPABASE_CONNECTION_STRING`. Existing public tables from the copied project:

- `conversations`, `messages`, `approval_requests`, `store_policies` (Store Concierge)
- `bookings`, `dining_tables`, `pr_audit_log`, `pr_reviews`, `restaurant_info` (from other projects sharing the instance)

Plan: leave all existing tables untouched. Create one new migration `003_reorder_agent.sql` with `ro_` prefixed tables and RLS policies that allow only the signed-in owner to read/write.

## 5. Supabase data model (`ro_` tables)

```sql
-- Suppliers
CREATE TABLE ro_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  address TEXT,
  lead_time_days INT NOT NULL,
  moq INT NOT NULL,
  case_pack INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which variants are supplied by whom
CREATE TABLE ro_supplier_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES ro_suppliers(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL UNIQUE,
  supplier_sku TEXT,
  unit_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily seeded fake sales (deterministic)
CREATE TABLE ro_sales_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_variant_id TEXT NOT NULL,
  date DATE NOT NULL,
  quantity INT NOT NULL,
  UNIQUE(shopify_variant_id, date)
);

-- Stock-check snapshots
CREATE TABLE ro_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_variant_id TEXT NOT NULL,
  on_hand INT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ro_snapshots_variant_checked ON ro_snapshots(shopify_variant_id, checked_at DESC);

-- Purchase orders
CREATE TABLE ro_purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES ro_suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  total_units INT NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  why_note TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ro_pos_one_draft_per_supplier ON ro_purchase_orders(supplier_id) WHERE status = 'draft';

-- PO lines
CREATE TABLE ro_po_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES ro_purchase_orders(id) ON DELETE CASCADE,
  shopify_variant_id TEXT NOT NULL,
  supplier_sku TEXT,
  item_name TEXT NOT NULL,
  size TEXT,
  qty INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);

-- Outbox: what would be emailed
CREATE TABLE ro_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES ro_purchase_orders(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  sent_at TIMESTAMPTZ
);

-- Agent run log
CREATE TABLE ro_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  summary TEXT,
  variants_checked INT,
  order_now_count INT,
  draft_pos_created INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- RLS: owner-only
ALTER TABLE ro_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_sales_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_runs ENABLE ROW LEVEL SECURITY;

-- Deny anon/authenticated, allow owner (authenticated user)
CREATE POLICY owner_all_ro_suppliers ON ro_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_supplier_items ON ro_supplier_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_sales_daily ON ro_sales_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_snapshots ON ro_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_purchase_orders ON ro_purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_po_lines ON ro_po_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_outbox ON ro_outbox FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_runs ON ro_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY deny_anon_ro_suppliers ON ro_suppliers FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_supplier_items ON ro_supplier_items FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_sales_daily ON ro_sales_daily FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_snapshots ON ro_snapshots FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_purchase_orders ON ro_purchase_orders FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_po_lines ON ro_po_lines FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_outbox ON ro_outbox FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_runs ON ro_runs FOR ALL TO anon USING (false);
```

## 6. Forecast maths (`lib/forecast.ts`)

All pure functions, unit-tested.

### Sales rate
Exponentially weighted moving average of the last 28 days, half-life 7 days:

```ts
const alpha = 1 - Math.exp(-Math.LN2 / 7); // ≈ 0.094
rate = sum(day_i_qty * alpha * (1 - alpha)^(days_ago_i - 1)) for i in 1..28
```

If a variant has no sales in the 28-day window, status is `No sales` and it is never reordered.

### Days of cover
```ts
daysOfCover = onHand / rate
```

### Run-out date
```ts
runOutDate = todayInStoreTimezone.plus({ days: Math.ceil(daysOfCover) })
```

### Reorder point
```ts
reorderPoint = rate * (supplier.leadTimeDays + 7)
```

### Status
- `Order now`: `onHand <= reorderPoint`
- `Watch`: `onHand <= reorderPoint + 7 * rate`
- `OK`: everything else
- `No sales`: `rate === 0`

### Suggested quantity
```ts
onOrder = sum(qty of open/approved PO lines for this variant)
baseNeed = rate * (leadTimeDays + 45) + reorderPoint - onHand - onOrder
suggested = ceilToCasePack(max(baseNeed, 0), supplier.casePack)
if (suggested < supplier.moq) suggested = supplier.moq
if (baseNeed <= 0) suggested = 0
```

`ceilToCasePack(x, c) = Math.ceil(x / c) * c`.

## 7. Agent run flow

1. `POST /api/agent/run` (owner session required).
2. Insert `ro_runs` row with `status = 'running'`.
3. Fetch 12 Northwind products/variants from Shopify via `getProducts()`.
4. Save one `ro_snapshots` row per variant.
5. Compute forecast per variant.
6. For every `Order now` variant, look up its supplier from `ro_supplier_items`.
7. Group by supplier. For each supplier:
   - If a `draft` PO already exists for that supplier, update it (delete old lines, insert new lines).
   - Otherwise create a new PO with the next `PO-2026-XXXX` number.
   - Insert `ro_po_lines` with rounded quantities and recalculated totals.
8. Ask Gemini for a one-paragraph `why_note` per draft PO from the computed facts. On failure, fall back to a template.
9. Generate the draft PDF with `@react-pdf/renderer` and save it to `public/pos/drafts/<po_number>.pdf` (watermark "DRAFT").
10. Update the run row: `status = 'completed'`, summary like `"Checked 60 variants · 5 to reorder · 2 draft POs ($2,184.00)"`.

Trigger: **Check stock** button in the top bar, plus a lightweight polling/revalidation schedule (re-run every 60 min while the dashboard is open, configurable via env).

## 8. Pages and layout (DESIGN section)

### Global shell
- Left sidebar (232px): logo mark + "Reorder Agent", nav links (Stock watch, Purchase orders with draft-count badge, Outbox, Suppliers), bottom pill "Northwind Supply Co. · Shopify dev store" with green dot.
- Top bar: page title, "Last check X min ago", **Check stock** button with spinner, avatar.
- Fonts: Inter (UI, tabular numbers), JetBrains Mono (SKUs, PO numbers).
- Colors: page bg `#F6F7F9`, surface `#FFFFFF`, border `#E5E7EB`, radius 14, shadow `0 1px 2px rgb(0 0 0/.04), 0 8px 24px -12px rgb(0 0 0/.08)`. Accent navy `#1E3A8A`.

### `/` — Stock watch
- 4 KPI tiles: Items to reorder, Running out in 14 days, Draft POs (count + value), Next run-out (item + date).
- Hero chart: past 60 days of stock (solid), projected line dashed, reorder-point line dashed `#B45309`, lead-time band shaded `#FDE68A` 35%, red run-out marker, PO-arrival marker if approved.
- SKU table: thumbnail + name + size, supplier, on hand, sales/day, days-of-cover bar, run-out date, status chip, mini sparkline, "In PO-2026-0003" link. Sorted by days of cover. Filter chips: All / Order now / Watch / OK.
- Agent activity panel: timeline of `ro_runs`.

### `/sku/[variantId]`
- Single-item chart, history table of snapshots, forecast numbers, list of linked POs.

### `/pos` and `/pos/[id]`
- List of draft and approved POs.
- Detail: left PDF preview (rendered pages with DRAFT watermark when draft), right summary card (supplier, lead time, expected arrival, editable lines with qty steppers, subtotal, why-note), approval card.
- Approval card: "Approve PO-2026-0003 for $1,254.00?", supplier email, disclaimer "Nothing is sent: the email goes to the Outbox", **Approve PO** / **Reject**.
- Approve → status `approved`, final PDF without watermark, "Approved by <owner> on <date>", add to `ro_outbox`.
- Reject → status `rejected`, store reason, next check can create a new draft.

### `/outbox`
- Email-style list. Open one to see To/Subject/Body and attached PDF. Banner: "Demo: emails are not sent".

## 9. PDF purchase order (`@react-pdf/renderer`)

Server-rendered A4 PDF:
- Navy header rule, Inter font.
- Company block (Northwind Supply Co.), supplier block.
- PO number (mono), issue date, required-by date.
- Table: supplier SKU, item name, size, qty, unit cost, line total.
- Subtotal, tax, total.
- Terms, signature/approval line.
- Draft watermark if status is `draft`.

## 10. Tests

- `__tests__/forecast.test.ts`: EWMA rate, days of cover, run-out date in timezone, reorder point, suggested qty (case pack, MOQ, on-order subtraction, never negative, no-sales status).
- `__tests__/agent.test.ts`: one open draft per supplier, re-run does not duplicate, no-sales variants are skipped.
- `__tests__/po.test.ts`: approve idempotency, rejected PO stays visible, unapproved PO never reaches outbox, PDF contains PO number and totals, edited qty re-rounds.
- `__tests__/auth.test.ts`: signed-out requests to every route return 401.

## 11. Package changes

Add to `package.json`:

```json
"recharts": "^2.x",
"@react-pdf/renderer": "^4.x",
"@react-pdf/font": "^3.x",
"date-fns": "^4.x",       // already present
"date-fns-tz": "^3.x",    // already present
"@fontsource/jetbrains-mono": "^5.x"
```

## 12. Environment variables

All already in `.env.local`:

```
SHOPIFY_STORE_DOMAIN
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_API_VERSION
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_CONNECTION_STRING
GEMINI_API_KEY
GEMINI_MODEL
OWNER_EMAIL
OWNER_PASSWORD
STORE_TIMEZONE
STORE_CURRENCY
```

No changes to `.env.local` keys are required.

## 13. Implementation order

1. Copy `wholesale_reorder` into `Wholesale_reorder_agent`.
2. Remove Store Concierge-specific files and routes.
3. Update `package.json` dependencies; install.
4. Write `supabase/migrations/003_reorder_agent.sql` and run it.
5. Write `lib/forecast.ts` and its tests.
6. Write `lib/db.ts`, `lib/po-pdf.tsx`, `lib/gemini.ts`.
7. Write `scripts/seed-reorder.mjs` and seed suppliers/sales.
8. Build `app/api/agent/run/route.ts`.
9. Build owner shell and dashboard pages/components.
10. Build PO detail and Outbox pages.
11. Add auth guards and route tests.
12. Run `npm run build` and the full test suite.
13. Design QA screenshots at 1440×900.

## 14. Out of scope

- Real email or supplier transmission.
- Airtable.
- Automatic unapproved PO submission.
- Modifying existing Store Concierge tables (`conversations`, `messages`, `approval_requests`, etc.).
