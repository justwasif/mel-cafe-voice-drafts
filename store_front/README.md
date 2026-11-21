# Store Concierge

A support chat for a Shopify dev store that answers order, returns and sizing questions from live store data. Refunds and discount codes never happen directly — they wait in an owner approval queue until the owner clicks **Approve**.

## Features

- **Customer chat** at `/` — asks for order number + email, looks up real Shopify order status + tracking, recommends sizes from product metafields, explains return policy, and creates pending refund / discount requests.
- **Owner dashboard** at `/owner` — sign in, view real-time approval queue, approve or reject requests. Approving a refund calls Shopify; approving a discount creates a Shopify discount code.
- **Live guest status** — after a request is created, the chat polls `/api/approval-status` every 2 seconds and updates the card when the owner decides.
- **RLS-protected Supabase tables** — all data access from the browser goes through server routes; anon users cannot read approval requests.

## Tech stack

- Next.js 16 (App Router, Turbopack)
- TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Realtime)
- Shopify Admin GraphQL API
- Google Gemini function calling

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
SHOPIFY_STORE_DOMAIN=your-dev-store.myshopify.com
SHOPIFY_API_VERSION=2026-04
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_ADMIN_ACCESS_TOKEN=          # optional; if set, used instead of client credentials
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_CONNECTION_STRING=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD=...
STORE_TIMEZONE=UTC
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run Supabase migrations:
   ```bash
   npm run db:run supabase/migrations/001_initial.sql
   npm run db:run supabase/migrations/002_realtime.sql
   ```

3. Create the owner user in Supabase Auth:
   ```bash
   npm run db:create-owner
   ```

4. Seed the Shopify dev store with products, customers and test orders:
   ```bash
   npm run seed:shopify
   ```

5. Run the dev server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) for the chat and [http://localhost:3000/owner](http://localhost:3000/owner) for the dashboard.

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Notes

- The Shopify client-credentials token is fetched fresh on each seed run and cached in memory until shortly before expiry. If you reinstall the app or change scopes, restart the server to get a fresh token.
- The dev server runs with `NODE_OPTIONS=--dns-result-order=ipv4first` to avoid long IPv6 fallback timeouts.
