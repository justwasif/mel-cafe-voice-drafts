import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import {
  readCart,
  readCartIdFromCookieHeader,
  revalidateCart,
  buildCheckoutLines,
  clearCart,
} from '@/lib/cart';

// ---------------------------------------------------------------------------
// Stripe guard
// ---------------------------------------------------------------------------

const env = z.object({
  STRIPE_SECRET_KEY: z.string().refine(
    k => k.startsWith('sk_test_'),
    'STRIPE_SECRET_KEY must start with sk_test_ (test mode only)',
  ),
  APP_URL: z.string().url(),
}).parse(process.env);

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

// ---------------------------------------------------------------------------
// POST /api/checkout
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Checkout Session for the current cart.
 *
 * Flow:
 * 1. Read cart from signed cookie.
 * 2. Re-read every price/stock level from Shopify.
 * 3. If anything changed → return { ok: false, changes: [...] }.
 * 4. Build Stripe Checkout Session with price_data from LIVE Shopify values.
 * 5. Return { ok: true, url: session.url }.
 */
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cartId = readCartIdFromCookieHeader(cookieHeader);

  if (!cartId) {
    return NextResponse.json({ ok: false, error: 'No active cart.' }, { status: 404 });
  }

  // Step 1: read the cart
  let cart;
  try {
    const result = await readCart(undefined);
    // If we have a cookie, use it; otherwise use whatever readCart gave us
    const resolvedId = cartId || result.cart.id;
    const { readCartById } = await import('@/lib/cart');
    const maybeCart = await readCartById(resolvedId);
    if (!maybeCart) {
      return NextResponse.json({ ok: false, error: 'Cart not found.' }, { status: 404 });
    }
    cart = maybeCart;
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not read your cart.' }, { status: 500 });
  }

  if (!cart.lines.length) {
    return NextResponse.json({ ok: false, error: 'Your cart is empty.' }, { status: 400 });
  }

  // Step 2 & 3: re-validate every line against live Shopify data
  const validated = await revalidateCart(cart);

  if (!validated.unchanged) {
    // Return structured changes so the UI can show a dialog
    return NextResponse.json({
      ok: false,
      error: 'Prices or stock changed since you added these items.',
      changes: [
        ...validated.priceChanges.map(c => ({
          title: c.title,
          size: '',
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
          oldStock: 0,
          newStock: 0,
        })),
        ...validated.stockIssues.map(s => ({
          title: s.title,
          size: '',
          oldPrice: 0,
          newPrice: 0,
          oldStock: s.requested,
          newStock: s.available,
          outOfStock: s.available <= 0,
        })),
        ...validated.removedLines.map(r => ({
          title: r.title,
          size: '',
          oldPrice: 0,
          newPrice: 0,
          oldStock: 0,
          newStock: 0,
          outOfStock: true,
        })),
      ],
    });
  }

  // Step 4: build Stripe Checkout Session from live-validated prices only
  const checkoutLines = await buildCheckoutLines(validated.cart);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: checkoutLines.lines.map(line => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${line.title} · ${line.size}`,
            description: `Northwind Supply Co. — ${line.title}`,
          },
          unit_amount: Math.round(line.unitPrice * 100), // cents
        },
        quantity: line.quantity,
      })),
      metadata: {
        cart_id: cart.id,
      },
      success_url: `${env.APP_URL}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/?cancelled=1`,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Could not start checkout with Stripe.' },
      { status: 502 },
    );
  }
}
