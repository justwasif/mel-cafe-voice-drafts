# Chat-to-Cart Store — SPEC

## Goal
A storefront with a **shopping assistant**. The shopper says what they need ("a warm jacket in M and something
to wear under it, under $200"); the assistant **searches the real catalogue in the Shopify dev store**, shows product
cards with live price and stock, **builds a cart**, and when the shopper clicks **Approve & checkout** it hands off to
**Stripe Checkout in test mode**. After the test payment, the app verifies it with Stripe and records the order in the
Shopify dev store.

Test mode and dev store only. Nothing is charged for real. Sample shoppers only (`@example.com`).

## Start from the Store Concierge code (don't rebuild what exists)
The B1-01 Store Concierge already has most of the plumbing. It's in the private repo `justwasif/30-projects-`, branch
**`b1-01-store-concierge`**, folder **`store_front/`**. Copy that folder to a new folder **`chat_to_cart/`** on a new
branch **`b2-01-chat-to-cart`** (from `main`), then change only what this spec needs.

**Reuse as-is (read it, don't rewrite it):**
| File | What it already does |
|---|---|
| `lib/shopify.ts` | `client_credentials` token with caching + refresh, `shopifyGraphQL()` with timeout/retry, `getProducts(query)` (titles, images, variants, **price**, **inventoryQuantity**, size options), `createDraftOrder`, `completeDraftOrder`, `markOrderAsPaid` |
| `app/page.tsx` | the `NORTHWIND_PRODUCTS` filter (only the 12 store products, so the dev store's default snowboards/gift card never show) and the `LOCAL_IMAGES` map |
| `public/products/*.jpg` | 12 product photos already matched to the catalogue |
| `scripts/seed-shopify.mjs` | the catalogue is **already seeded** in the dev store (12 products, sizes XS–XL, stock per size). **Don't re-run it.** |
| `lib/gemini.ts` | the Gemini function-calling loop and the "claims without a tool result" guard. Keep the loop and guard; replace the tools and system prompt |
| `app/api/chat/route.ts` | chat route with zod validation (`conversation_id` is `.nullish()`, keep that) |
| `app/storefront-client.tsx` | header, hero, product grid, sold-out badge, chat widget shell. Restyle and extend per DESIGN, don't start from zero |
| `app/globals.css` / Tailwind theme | the Northwind palette (cream, forest, terracotta) and fonts |
| `.env.local` keys | the same Shopify app works (scopes checked: `read_products`, `read_inventory`, `write_draft_orders`, `write_orders`) |

**Remove (not part of this project):** the owner dashboard (`app/owner`, `app/api/owner/*`), refunds, discounts and the
approval queue (`lib/approval.ts`, `app/api/approval-status`), order lookup / size-help / policy tools, all Supabase
code (`lib/supabase-*`, `supabase/migrations`, Supabase env vars) and the scripts tied to them.

**Build new:** `search_products` and cart tools on top of `getProducts`, the cart store, product/cart/checkout cards
in the chat, the Stripe Checkout route with the `sk_test_` guard, the `/order/[sessionId]` page, the grid-filtering
behaviour, and the tests below. Run the existing tests that still apply after the removal.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + lucide; Vitest.
- **Shopify Admin GraphQL** (dev store) via the existing Dev Dashboard app: `client_credentials` token from
  `https://{SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token` (24 h, cache and refresh). Scopes already granted:
  `read_products`, `read_inventory`, `write_draft_orders`, `write_orders`.
- **Stripe** (`stripe` npm) with `STRIPE_SECRET_KEY`. **Refuse to start unless it begins with `sk_test_`.**
  Hosted Stripe Checkout (redirect), no card fields in our app.
- **Google Gemini** (free) with function calling for the assistant. Model from `GEMINI_MODEL`.
- Cart: server-side (new), keyed by an httpOnly signed cookie (`SESSION_SECRET`); stored in memory + `data/carts.json`
  for restarts. No other database.
- `.env.example` committed with empty values; `.env.local` never committed or overwritten.

## Environment variables
SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_VERSION, STRIPE_SECRET_KEY,
GEMINI_API_KEY, GEMINI_MODEL, SESSION_SECRET, APP_URL (e.g. http://localhost:3002), STORE_CURRENCY (USD)

## Catalogue
- Only the **12 Northwind products** already in the dev store (reuse the `NORTHWIND_PRODUCTS` filter and local photos).
  Variants show size, price and **available quantity** (`inventoryQuantity`). Out-of-stock variants are shown but
  can't be added (the seed has some, e.g. Canvas Shorts M, Chino Pants S, Field Jacket XL).
- Prices, titles, stock and images always come from Shopify at the moment of the call. **Never from the model.**

## The assistant (tools)
| Tool | Does |
|---|---|
| `search_products(query, max_price?, size?, category?)` | Shopify product search, returns up to 6 products with variants |
| `get_product(id)` | full details + variants + stock |
| `add_to_cart(variant_id, quantity)` | re-checks stock and price in Shopify, then adds; returns the cart |
| `update_cart(line_id, quantity)` / `remove_from_cart(line_id)` | edit the cart |
| `view_cart()` | the current cart with a server-calculated total |
| `propose_checkout()` | returns a **checkout card** for the shopper to approve. It does **not** create a payment |

Rules (system prompt + code guards):
- Recommend only products returned by tools. Never invent a product, price, discount or stock level.
- Ask one short question when size is missing. Keep replies to 2–3 sentences; the cards carry the details.
- The assistant can never pay, apply discounts or change prices. If it claims "added" or "checkout ready" without
  the tool result, the code nudges it once to call the tool or drop the claim.

## Checkout (only after the shopper approves)
1. The chat shows the **checkout card**: line items, quantities, prices, total, "Test mode: no real charge".
   Buttons **Approve & checkout** (primary) and **Keep shopping**.
2. On Approve, the server **re-reads every price and stock level from Shopify** and builds the Stripe Checkout
   Session with `price_data` from those values (never from the client or the model), `mode: payment`,
   `metadata.cart_id`, `success_url={APP_URL}/order/{CHECKOUT_SESSION_ID}`, `cancel_url={APP_URL}/?cancelled=1`.
   If a price or stock changed, show the change and ask again instead of continuing.
3. Redirect to Stripe's hosted page. Test card: `4242 4242 4242 4242`, any future date, any CVC.
4. `/order/[sessionId]`: retrieve the session from Stripe; only if `payment_status === 'paid'`:
   create a **Shopify draft order** with the same lines, tag `chat-to-cart`, note `Stripe test session <id>`, and
   `draftOrderComplete` (marked paid). **Idempotent:** store the Shopify order id in the Stripe session metadata
   (update after creation) and skip if it's already there. Then clear the cart.
5. The order page shows: "Paid (test mode)", the Shopify order number (e.g. #1016), items and total.

## Pages
- `/` — storefront + assistant.
- `/order/[sessionId]` — confirmation.

## DESIGN — follow exactly (it must look like a real store on video)
Use the **product-ui-ux** skill if it's available. Personality: **trusted commerce**: warm, clean, product photos are the hero.

### Tokens
| Token | Value |
|---|---|
| Page bg | the existing Northwind `cream` (keep the B1-01 palette so both store videos match) |
| Surface | `#FFFFFF`, border `#ECE7E1`, radius 16 (cards), 10 (buttons/inputs), soft shadow `0 1px 2px rgb(0 0 0/.04), 0 10px 30px -12px rgb(0 0 0/.10)` |
| Text | `#1F1B16`; secondary `#6B6259`; muted `#A39A90` |
| Accent | the existing Northwind `forest` (primary buttons, links, assistant accents); `terracotta` for prices on sale and the hero CTA |
| Price | `#1F1B16` 600 tabular-nums; sale price in `#B4462B` |
| Status | in stock `#15803D` · low stock (≤5) `#B45309` · out of stock `#A39A90` · test-mode badge `#635BFF` on `#EEF0FF` |
| Fonts | headings **Fraunces** 600; UI **Inter** 14/16; prices tabular |
| Spacing | 4px grid; page padding 32–48px; card gaps 20–24px |

### Layout (1440×900)
- **Header (64px):** the existing store name "Northwind Supply Co." with its "N" logo mark, search field, "Test mode" badge,
  cart button with item count badge.
- **Left (≈62%) — storefront:** a short hero strip ("Gear for cold mornings", one line) then a product grid
  (3 columns): photo (4:5, rounded 12), title, price, stock chip, size chips. When the assistant searches, the grid
  **filters to its results** with a "Showing 4 picks from your assistant · Clear" bar, matching cards get a soft
  green outline.
- **Right (≈38%) — assistant panel (docked, full height):** header with avatar + "Shopping assistant" + online dot;
  messages (user right in accent, assistant left in white); assistant replies can include **product cards**
  (image, title, price, stock, size chips, **Add to cart**), a **cart card** (lines with thumbnails, qty steppers,
  subtotal) and the **checkout card** (see below). Input at the bottom: rounded, placeholder "Ask for anything:
  'a warm jacket in M under $150'", send button, 3 suggestion chips above it on first load.
- **Tool activity line** under assistant messages, small and muted: "Searched catalogue · 4 results",
  "Checked stock · Field Jacket M: 9 left", "Added to cart".
- **Cart drawer** (from the header button): lines, totals, same **Approve & checkout** button.
- **Checkout card:** title "Ready to check out?", line items with thumbnails, total large (28px), a row
  "Payment by Stripe · test mode, no real charge" with a lock icon, buttons **Approve & checkout** (accent, 44px)
  and **Keep shopping**. After approval: button spinner → "Redirecting to secure checkout…".
- **Order page:** centred card: drawn check, "Order confirmed", Shopify order number, "Paid · test mode" chip,
  items, total, "Back to the store".
- Responsive: below 1024px the assistant becomes a bottom sheet with a floating "Ask the assistant" button.

### States
Skeleton product cards while searching; typing dots while the assistant thinks; empty search ("No match for
'waterproof sandals'. Try…"); out-of-stock chips disabled with tooltip; price-changed dialog; Stripe cancelled
banner ("Checkout cancelled, your cart is saved"); error toasts with retry. No `alert()`.

### Design QA (before saying done)
Screenshot at 1440×900: first load, assistant results filtering the grid, cart card, checkout card, Stripe page
(test badge visible), order confirmation. Score each with the product-ui-ux rubric, fix anything below 4/5, show before/after.

## Quality
- zod on all routes; tests first for: catalogue filter (no gift cards/drafts/hidden), price and stock re-check before
  checkout, Stripe line items built from Shopify prices only, `sk_test_` guard, success page refuses unpaid
  sessions, Shopify order idempotency (same session twice → one order), the "claims without tool" guard.
- README: setup, keys, test card, how the handoff works, limitations.

## Acceptance checklist (Mel runs and shows each)
1. "I need a warm jacket in M and a base layer, under $200" → assistant searches, grid filters, product cards with real
   prices and stock, adds Field Jacket M + Base Layer Tee M after the shopper confirms; cart total $163.00.
2. "Canvas Shorts in M" (out of stock in the seed) → assistant says it's out of stock (from Shopify) and offers an in-stock size or alternative.
3. Approve & checkout → Stripe hosted Checkout in **test mode** with the same lines and total.
4. Pay with 4242… → order page shows "Paid · test mode" and a real Shopify order number; the Shopify order exists
   with tag `chat-to-cart`. Reloading the order page does not create a second order.
5. A price changed in Shopify between cart and checkout → the app shows the change and asks again.
6. With a live key (`sk_live_…`) the app refuses to start.
7. Design QA screenshots match the DESIGN section.
8. `npm run build` and tests pass.
