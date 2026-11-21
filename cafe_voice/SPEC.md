# Cafe Voice Ordering — SPEC

## Goal
For a small cafe (sample cafe **Ember & Oat**, fake). A customer orders **by voice in the browser** ("a large oat
latte and a cinnamon bun"). The order appears live on the **kitchen screen**. Staff **confirm** it (or mark an item
unavailable). **Only after staff confirm** is a **Stripe test payment link** created and shown to the customer
(link + QR). After the test payment the order moves to "Paid · preparing" → "Ready".

Sample data only: fake menu and customers. Stripe **test mode**; nothing is charged for real.

## Start from the Restaurant Voice Host code (don't rebuild what exists)
This folder is a copy of B1-02 `restaurant-voice` (branch `b1-02-restaurant-voice-host`). **Reuse:**
| File | Reuse for |
|---|---|
| `src/components/MicOrb.tsx` | the mic button / listening orb |
| `src/app/api/stt/route.ts`, `src/app/api/tts/route.ts` | ElevenLabs speech-to-text and text-to-speech |
| `src/lib/gemini.ts`, `src/lib/tools.ts`, `src/app/api/chat/route.ts` | the function-calling loop (replace tools/prompt) |
| `src/app/host/page.tsx`, `src/components/BookingCard.tsx` | host approval screen + live card → becomes the **kitchen screen** + order ticket |
| `src/lib/supabase.ts`, `supabase/migrations/002_realtime.sql`, `scripts/create-host.cjs` | Supabase client, Realtime, staff login |
**Remove:** booking/availability logic, tables/time-slot data, booking tests. New tables use the prefix **`cf_`**
(shared Supabase project; don't touch other tables).

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + lucide + Motion; Jest/Vitest. Port **3011**.
- **ElevenLabs** (free tier, ~6,000 characters left this month: keep spoken replies short, ≤ 2 sentences; default to
  a premade voice when `ELEVENLABS_VOICE_ID` is empty). Speech-to-text for the customer, text-to-speech for replies.
- **Gemini** (free) for understanding the order (function calling). Prices and availability only from the database.
- **Supabase** (Postgres + Auth for staff + Realtime). `cf_` tables, RLS on.
- **Stripe test mode** via the **add-stripe-checkout** skill: Checkout Session with `price_data` from the confirmed
  order (or a Payment Link), refuse to start unless `sk_test_`.

## Environment variables
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_CONNECTION_STRING,
GEMINI_API_KEY, GEMINI_MODEL, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, STRIPE_SECRET_KEY, CAFE_TIMEZONE,
CAFE_CURRENCY (USD), APP_URL (http://localhost:3011), STAFF_EMAIL, STAFF_PASSWORD

## Data (`cf_` tables)
- `cf_menu`: ~18 items (coffee, tea, bakery, breakfast) with sizes, price per size, options (oat/almond milk +$0.60,
  extra shot +$0.80), `available` flag. Seeded; 1–2 items marked sold out (e.g. "Almond croissant").
- `cf_orders`: order number (`EO-0142`), customer first name (fake), status
  `listening → draft → sent_to_kitchen → confirmed → payment_link_sent → paid → ready` (or `rejected`), totals,
  stripe session id + url, timestamps.
- `cf_order_items`: item, size, options, qty, unit price, line total, `unavailable` flag set by staff.
- `cf_events`: audit log.

## Voice ordering (customer page `/`)
1. Tap the mic → speak → live transcript → the agent understands the order via tools.
2. Tools: `search_menu(query)`, `add_item(item_id, size, options, qty)`, `remove_item(line_id)`, `view_order()`,
   `send_to_kitchen()`. Prices and stock **only from the database**; sold-out items are refused with an alternative.
3. The order builds live as a ticket on screen while the agent confirms out loud ("One large oat latte and a
   cinnamon bun, $9.40. Send it to the kitchen?").
4. Customer says yes or taps **Send to kitchen** → status `sent_to_kitchen`; the screen shows "Waiting for the
   kitchen to confirm…". **No payment yet.**
5. When staff confirm: the screen updates live with **Pay $9.40 (test)** button + QR code of the Stripe test link.
   If staff mark something unavailable, the customer hears/sees it and can change the order.

## Kitchen screen (`/kitchen`, staff signed in)
- Live board (Realtime): columns **New · Confirmed / awaiting payment · Paid · preparing · Ready**.
- New tickets slide in with a short highlight: order number, name, items with sizes/options, total, time since.
- Buttons: **Confirm order** (primary), **Item unavailable** per line, **Reject** (reason).
- **Confirm** → re-read prices from the DB → create the **Stripe test Checkout Session** with `price_data`
  (`metadata.order_id`, success URL `/order/[id]?paid=1`) → status `payment_link_sent`. Idempotent: confirming twice
  creates one session. **No Stripe call before Confirm** (test).
- After payment: the order shows "Paid (test)" (verified with Stripe on the success page or by polling the session),
  staff tap **Ready** → customer screen shows "Your order EO-0142 is ready".

## Worktrees (required Mel feature)
Build the two screens **side by side in two git worktrees** (`../cafe-ordering` for the customer voice page,
`../cafe-kitchen` for the kitchen screen) on two branches, sharing the same `cf_` schema and types (defined first on
the main branch), then merge both into `b1-07-cafe-voice-ordering`.

## DESIGN — follow exactly
Use the **product-ui-ux** skill. Personality: **warm cafe** for the customer, **kitchen display** (high contrast,
glanceable) for staff. Same tokens.
| Token | Value |
|---|---|
| Customer bg | `#F6EFE6` (oat) ; kitchen bg `#14110F` (espresso) |
| Surface | customer `#FFFFFF` border `#EADFD2` radius 18 ; kitchen `#211C18` border `#3A312A` radius 14 |
| Text | customer `#2A1F17` / `#7A6A5C` ; kitchen `#F5EDE4` / `#B3A496` |
| Accent | ember `#C2410C`, hover `#9A3412`, soft `#FDEBDD`; second accent sage `#4D7C5A` |
| Status | new `#F59E0B` · confirmed `#3B82F6` · paid `#22C55E` · ready `#4D7C5A` · rejected `#EF4444` · test badge `#635BFF` |
| Fonts | headings **Fraunces** 600 (customer), UI **Inter**; kitchen tickets Inter 600 large, order numbers **JetBrains Mono** |
**Customer page (390×844 phone first, centred on desktop):** cafe wordmark, big **mic orb** (signature visual:
breathes while listening, ripples with the audio level, waveform under it), live transcript, the order ticket building
line by line (items pop in, total counts up), then "Waiting for the kitchen…" (gentle pulse), then the **Pay (test)**
card with QR, then "Ready" with a check that draws.
**Kitchen screen (1440×900 landscape, readable from 2 m):** top bar with clock, open orders count, "Stripe test mode";
the 4-column board; tickets as big cards with a timer that turns amber after 5 min; **Confirm order** 48px.
Motion (mandatory per the skill): ticket slide-in + highlight, column moves with layout animation, total count-up,
orb animation, check draw.

### States
Mic permission denied (type instead), not understood ("Sorry, could you say that again?"), sold out, kitchen
rejected/unavailable, Stripe error with retry, payment cancelled, voice quota low (fall back to text replies). No `alert()`.

### Design QA
Screenshots: customer listening, order building, waiting, pay card, ready; kitchen with 3+ tickets, confirm done,
paid column. Score with the product-ui-ux rubric (incl. motion + palette), fix anything below 4, show before/after.

## Quality
- zod on every route; staff session checked server-side; RLS on `cf_` tables.
- Tests first: price calculation with sizes/options, sold-out refusal, order state machine (no skipping states),
  **no Stripe call before staff confirm**, confirm idempotency (one session), Stripe line items from DB prices only,
  `sk_test_` guard, the agent never claims "paid" or "confirmed" without the status.
- README: setup, seed, staff login, how voice + payment work, limitations (sample menu, test mode, free voice quota).

## Acceptance checklist (Mel runs and shows each)
1. Seed → customer says "a large oat latte and a cinnamon bun" → ticket shows both with the right total.
2. "An almond croissant" → refused as sold out with an alternative.
3. Send to kitchen → appears live on `/kitchen`; no Stripe session exists yet (check with the Stripe connector / API).
4. Staff **Confirm order** → one Stripe **test** Checkout Session with the same lines → customer sees Pay + QR.
5. Pay with 4242 → order "Paid (test)" on both screens → staff **Ready** → customer sees Ready.
6. Item unavailable → customer told, order updated, total recalculated.
7. Confirming twice → still one session; `sk_live_` refused; signed-out kitchen routes 401.
8. Design QA screenshots match the DESIGN section; build and tests pass.
