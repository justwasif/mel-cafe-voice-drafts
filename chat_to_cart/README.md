# Chat-to-Cart Store

A storefront with a conversational shopping assistant. The assistant searches the Shopify dev catalogue, shows live product cards, builds a cart, and hands off to Stripe Checkout in test mode.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Shopify Admin GraphQL (dev store)
- Stripe Checkout (test mode only)
- Google Gemini function calling
- Vitest for tests

## Setup

1. Copy the environment variables:

   ```bash
   cp .env.example .env.local
   ```

2. Fill in `.env.local` with real values. Required keys:

   | Variable | Purpose |
   |---|---|
   | `APP_URL` | Public URL, e.g. `http://localhost:3002` |
   | `SHOPIFY_STORE_DOMAIN` | `my-store.myshopify.com` |
   | `SHOPIFY_CLIENT_ID` | Shopify custom app client ID |
   | `SHOPIFY_CLIENT_SECRET` | Shopify custom app client secret |
   | `SHOPIFY_API_VERSION` | Shopify API version, e.g. `2025-04` |
   | `STRIPE_SECRET_KEY` | Must start with `sk_test_` |
   | `GEMINI_API_KEY` | Google Gemini API key |
   | `GEMINI_MODEL` | Model name, e.g. `gemini-2.0-flash-lite` |
   | `SESSION_SECRET` | Random string for cookie signing |
   | `STORE_CURRENCY` | Currency code, e.g. `USD` |

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Tests

Run the Vitest suite:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Checkout flow

1. Ask the assistant for products. It searches Shopify and returns cards with live price and stock.
2. Add items to the cart. The assistant always re-checks stock and price before adding.
3. Click **Approve & checkout** in the chat or cart drawer. The server re-reads every price and stock level from Shopify, then creates a Stripe Checkout Session.
4. You are redirected to Stripe's hosted checkout page.
5. Pay with the Stripe test card.
6. Return to `/order/{CHECKOUT_SESSION_ID}`. The app creates a Shopify draft order, completes it as paid, and shows the order number.

## Stripe test card

| Field | Value |
|---|---|
| Number | `4242 4242 4242 4242` |
| Expiry | Any future date |
| CVC | Any 3 digits |
| ZIP | Any valid postcode |

## Limitations

- **Test mode only.** The app refuses to start if `STRIPE_SECRET_KEY` does not begin with `sk_test_`.
- Cart storage is server-side and persisted to `data/carts.json` so it survives restarts. It is not shared across processes.
- The catalogue is limited to the 12 Northwind products already seeded in the Shopify dev store.
- Prices, titles, stock, and images are always fetched from Shopify at the moment of the call; the assistant cannot invent or change them.
