# Store Concierge — SPEC

## Goal
A support chat for a Shopify **dev store** ("Northwind Supply Co.", a fake apparel shop). Customers ask
about their orders, returns and sizing; the AI answers from **live store data** via the Shopify Admin API.
When a customer asks for a **refund** or the AI wants to offer a **discount code**, nothing happens in
Shopify yet: a request goes into the **owner approval queue**. Only when the owner clicks **Approve**
does the app issue the refund / create the discount code in Shopify. The customer sees the result live.

All data is fake. Dev store and test payments only. Nothing is charged or refunded for real.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployable on Vercel.
- Shopify Admin **GraphQL** API, version from `SHOPIFY_API_VERSION`. All Shopify calls are server-side.
  - Auth: use `SHOPIFY_ADMIN_ACCESS_TOKEN` if set. If only `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET`
    are set, get a token with the client-credentials grant for the store and cache it until expiry.
- Supabase (Postgres + Realtime + Auth), free tier.
- Google Gemini (free key) with function calling. Model from `GEMINI_MODEL`.
- No secret ever reaches the browser. `.env.example` is committed with empty values; `.env.local` is not.

## Environment variables
SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_CONNECTION_STRING,
GEMINI_API_KEY, GEMINI_MODEL, OWNER_EMAIL, OWNER_PASSWORD, STORE_TIMEZONE

## Seed the dev store (use the Shopify connector)
- ~12 products with size variants (XS–XL) and a size chart in each product's metafield or description
  (chest/waist in cm and inches). Some sizes out of stock.
- ~8 fake customers (`*@example.com`).
- ~10 **test** orders (Bogus Gateway / mark as paid) across states: unfulfilled, fulfilled with a tracking
  number, partially fulfilled, one already refunded. Order dates spread over the last 30 days.
- A return policy text (30 days, unworn, free exchanges, refunds to original payment) stored in Supabase
  `store_policies` and shown to the AI only through a tool.

## Database (create with the Supabase connector, as migrations in /supabase/migrations)
- `conversations`: id, customer_email (nullable), started_at.
- `messages`: id, conversation_id, role ('customer' | 'assistant'), content, created_at.
- `approval_requests`: id (uuid), reference (`AR-` + 6 random uppercase letters/digits), conversation_id,
  type ('refund' | 'discount'), shopify_order_id, order_name (e.g. #1004), customer_email,
  amount, currency, line_items (jsonb), reason, ai_summary, discount_percent (for discounts),
  status ('pending' | 'approved' | 'rejected' | 'failed'), created_at, decided_at, decision_note,
  shopify_result (jsonb: refund id or discount code), error.
- `store_policies`: key, text.
- Unique rule: at most one **pending** request per (shopify_order_id, type). Enforce in the database.
- RLS on everything. Anonymous users can't read or write these tables directly; the server uses the
  service role. Only the signed-in owner can read `approval_requests` and update status.
- Add `approval_requests` to the `supabase_realtime` publication.
- Create the owner user in Supabase Auth from `OWNER_EMAIL`/`OWNER_PASSWORD` (email confirmed).

## The concierge (Gemini tools, implemented server-side)
1. `lookup_order(order_number, email)` — returns status, items, fulfillment + tracking, refund state.
   **Only** if the email matches the order's customer email. Otherwise: "I couldn't find that order."
2. `size_help(product_query, measurements?)` — product sizes, size chart, stock per size; recommends a size.
3. `get_policy(topic)` — return/exchange/shipping policy text.
4. `request_refund(order_number, email, line_items, reason)` — checks eligibility (paid, within 30 days,
   not already refunded) and **creates a pending approval_request**. Never calls Shopify's refund API.
5. `propose_discount(order_number, email, percent, reason)` — max 15%, only for a real problem
   (late delivery, out-of-stock size). Creates a **pending** approval_request. Never creates a code itself.
6. `request_status(reference)` — current status of an approval request.

Behaviour:
- Friendly, short answers (2–3 sentences). Ask for order number + email before showing order details.
- Never say a refund is done or a code exists until the request is **approved**. Say:
  "I've sent this to the store owner for approval — you'll see the result here."
- Never invent orders, sizes, stock, prices or policies — only tool results.
- Dates/times always in `STORE_TIMEZONE`.

## Customer chat ( / )
- Looks like a real store support widget: store header, product-style styling, chat bubbles,
  quick-reply chips ("Where's my order?", "Start a return", "Size help").
- When a tool creates an approval request, the **API returns its reference in the JSON response**
  (e.g. `{ reply, approval_reference }`). The page shows a request card from that field —
  **never** by parsing the AI's text.
- The request card shows Pending → Approved (with refund amount or the discount code) / Rejected,
  updating live (poll a server route every 2 s, or Realtime broadcast). The route returns only status
  and the result for that reference — no personal data.
- Optional: `public/widget.js` that adds a floating "Chat with us" button to any page (for the dev
  store theme). Don't edit the theme unless asked.

## Owner dashboard ( /owner )
- Supabase Auth email + password login.
- Tabs: Pending · Approved · Rejected · Failed. New requests appear **live** (Realtime) with a soft chime.
- Each card: type, order, customer, amount / percent, items, the customer's reason, the AI's
  one-line summary, how long ago.
- **Approve** → server calls Shopify:
  - refund: `refundCreate` for the given line items (test order), then stores the refund id;
  - discount: `discountCodeBasicCreate` with a unique code (e.g. `SORRY-XXXX`), one use, 30-day expiry.
  Then status → approved. If Shopify errors: status → failed, show the error, nothing half-done.
- **Reject** → asks for an optional note; status → rejected. The customer sees it live.
- Approve is idempotent: double-clicking can't refund twice (check status in a transaction first).

## Quality
- zod validation on every route and tool argument. Rate-limit the chat route.
- Tests first for the core logic (eligibility, discount cap, approve idempotency, email check),
  then make them pass.
- Graceful errors: Shopify down, Gemini quota, order not found, already refunded.
- README: setup, env vars, seeding, migrations, deploy on Vercel.

## Acceptance checklist (Mel runs each one and shows the result)
1. "Where is my order #10xx?" with the right email → status + tracking from Shopify.
2. Same order with the wrong email → "I couldn't find that order", no details leaked.
3. "What size should I get in the Field Jacket? Chest 98 cm" → size from the chart + stock.
4. "I want to return the jacket from #10xx" → eligible → pending request appears **live** on /owner,
   customer card shows Pending.
5. Owner clicks **Approve** → refund created in Shopify (visible in the dev store order) → customer card
   flips to Approved with the amount, live.
6. Late delivery complaint → AI proposes 10% → owner approves → code created in Shopify, shown to customer.
7. Owner rejects a request → customer sees Rejected with the note.
8. Asking twice for the same refund → no duplicate request (DB rule).
9. Order already refunded / older than 30 days → refused politely, no request created.
10. Anonymous Supabase client can't read `approval_requests` (RLS).
11. `npm run build` and the tests pass.
