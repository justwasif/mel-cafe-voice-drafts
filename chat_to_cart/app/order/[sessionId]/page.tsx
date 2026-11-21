import { Metadata } from 'next';
import { connection } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import {
  readCartIdFromCookieHeader,
  readCartById,
  clearCart,
  buildCheckoutLines,
} from '@/lib/cart';
import {
  createDraftOrder,
  completeDraftOrder,
  markOrderAsPaid,
} from '@/lib/shopify';

export const metadata: Metadata = {
  title: 'Order Confirmed | Northwind Supply Co.',
};

// The order page reads the Stripe session at request time — it must never
// be prerendered.
export const instant = false;

const env = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
}).parse(process.env);

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

async function OrderConfirmation({ sessionId }: { sessionId: string }) {
  // Opt out of prerendering: this page hits Stripe and Shopify live.
  await connection();

  let session: Stripe.Checkout.Session | null = null;
  let error: string | null = null;

  // ── Step 1: retrieve the Stripe session ──────────────────────────────
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
  } catch (err: any) {
    error = `Could not verify payment: ${err?.message ?? 'Unknown error'}`;
  }

  // ── Step 2: check payment status ─────────────────────────────────────
  if (session && session.payment_status !== 'paid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">
            Payment not completed
          </div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">
            The Stripe session was not completed. Your cart is saved.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">Something went wrong</div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">{error}</p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  // ── Step 3: idempotency — skip if order already created ──────────────
  if (session.metadata?.shopify_order_id) {
    // Already recorded in Shopify — show confirmation directly
    const cartId = session.metadata?.cart_id;
    let cart = null;
    if (cartId) {
      cart = await readCartById(cartId);
    }

    const total = Number(session.amount_total ?? 0) / 100;

    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-lg rounded-2xl border border-nw-border bg-white p-8 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5EE] text-[#15803D]">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-semibold text-nw-text">Order confirmed</h1>
            <p className="mt-1 text-sm text-nw-text-secondary">Northwind Supply Co.</p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <span className="rounded-full bg-nw-test-bg px-3 py-1 text-xs font-semibold text-nw-test">
              Paid · test mode
            </span>
            <span className="rounded-full bg-[#EAF5EE] px-3 py-1 text-xs font-semibold text-[#15803D]">
              Shopify order recorded
            </span>
          </div>

          {cart && cart.lines.length > 0 && (
            <div className="mt-6 space-y-2">
              {cart.lines.map(line => (
                <div key={line.id} className="flex items-center gap-3 rounded-xl border border-nw-border p-3">
                  {line.image ? (
                    <img src={line.image} alt={line.title} className="h-12 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-10 rounded-lg bg-[#F3F0EC]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-nw-text">{line.title}</div>
                    <div className="text-xs text-nw-text-secondary">
                      {line.size} · Qty {line.quantity}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-nw-text">
                    ${(line.price * line.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-baseline justify-between border-t border-nw-border pt-4">
            <span className="text-sm font-medium text-nw-text-secondary">Total</span>
            <span className="text-[22px] font-semibold tabular-nums text-nw-text">
              ${total.toFixed(2)}
            </span>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-block rounded-[10px] border border-nw-border px-5 py-2.5 text-sm font-semibold text-nw-text-secondary transition-colors hover:border-forest-400 hover:text-forest-700"
            >
              Back to the store
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: create the Shopify draft order ───────────────────────────
  const cartId = session.metadata?.cart_id;
  if (!cartId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">Missing cart reference</div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">
            The Stripe session did not include a cart reference.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  const cart = await readCartById(cartId);
  if (!cart || !cart.lines.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">Cart not found</div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">
            Your cart could not be retrieved for order recording.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  // Build the Shopify draft order lines (variant IDs come from the validated cart)
  const checkoutLines = await buildCheckoutLines(cart);
  const total = checkoutLines.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  const draftInput = {
    lineItems: cart.lines.map(line => ({
      variantId: line.variantId,
      quantity: line.quantity,
    })),
    tags: ['chat-to-cart'],
    note: `Stripe test session ${session.id}`,
  };

  const draftResult = await createDraftOrder(draftInput);

  if (draftResult.userErrors?.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">Order creation failed</div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">
            Shopify returned errors: {draftResult.userErrors.map((e: any) => e.message).join(', ')}
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  const draftOrderId = draftResult.draftOrder?.id;
  if (!draftOrderId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-8 text-center shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
          <div className="font-serif text-2xl font-semibold text-nw-text">Order creation failed</div>
          <p className="mt-2 text-[13px] text-nw-text-secondary">
            Shopify did not return a draft order ID.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-[10px] bg-forest-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Back to the store
          </a>
        </div>
      </div>
    );
  }

  // Complete the draft order (converts to order) and mark as paid
  const completeResult = await completeDraftOrder(draftOrderId);
  if (completeResult.userErrors?.length) {
    // Not fatal — the draft order exists; mark as paid via orderMarkAsPaid
  }

  const shopifyOrderId = completeResult.draftOrder?.order?.id;
  const shopifyOrderName = completeResult.draftOrder?.order?.name;

  if (shopifyOrderId) {
    await markOrderAsPaid(shopifyOrderId);
  }

  // Store the Shopify order ID in Stripe session metadata for idempotency
  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...session.metadata,
        shopify_order_id: shopifyOrderId ?? draftOrderId,
      },
    });
  } catch {
    // Metadata update is best-effort; the order already exists
  }

  // Clear the cart
  await clearCart(cartId);

  // ── Render: confirmation ──────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-lg rounded-2xl border border-nw-border bg-white p-8 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5EE] text-[#15803D]">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-nw-text">Order confirmed</h1>
          <p className="mt-1 text-sm text-nw-text-secondary">
            {shopifyOrderName ? `Order ${shopifyOrderName}` : 'Northwind Supply Co.'}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="rounded-full bg-nw-test-bg px-3 py-1 text-xs font-semibold text-nw-test">
            Paid · test mode
          </span>
        </div>

        <div className="mt-6 space-y-2">
          {checkoutLines.lines.map(line => (
            <div key={line.lineId} className="flex items-center gap-3 rounded-xl border border-nw-border p-3">
              {line.image ? (
                <img src={line.image} alt={line.title} className="h-12 w-10 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-10 rounded-lg bg-[#F3F0EC]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-nw-text">{line.title}</div>
                <div className="text-xs text-nw-text-secondary">
                  {line.size} · Qty {line.quantity}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-nw-text">
                ${(line.unitPrice * line.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-between border-t border-nw-border pt-4">
          <span className="text-sm font-medium text-nw-text-secondary">Total</span>
          <span className="text-[22px] font-semibold tabular-nums text-nw-text">
            ${total.toFixed(2)}
          </span>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="inline-block rounded-[10px] border border-nw-border px-5 py-2.5 text-sm font-semibold text-nw-text-secondary transition-colors hover:border-forest-400 hover:text-forest-700"
          >
            Back to the store
          </a>
        </div>
      </div>
    </div>
  );
}

export default async function OrderPage({ params }: Props) {
  const { sessionId } = await params;
  return <OrderConfirmation sessionId={sessionId} />;
}
