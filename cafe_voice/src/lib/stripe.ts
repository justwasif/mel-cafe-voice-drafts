import Stripe from 'stripe';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!key.startsWith('sk_test_')) {
    throw new Error('Cafe Voice only runs in Stripe test mode. Use a sk_test_ key.');
  }
  return new Stripe(key, { apiVersion: '2026-11-18.endive' });
}

export interface StripeLineItem {
  name: string;
  amount: number;
  qty: number;
}

export async function createCheckoutSession(orderId: string, orderNumber: string, lineItems: StripeLineItem[], appUrl: string) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems.map((li) => ({
      price_data: {
        currency: process.env.CAFE_CURRENCY?.toLowerCase() || 'usd',
        product_data: { name: li.name },
        unit_amount: li.amount,
      },
      quantity: li.qty,
    })),
    metadata: { order_id: orderId, order_number: orderNumber },
    success_url: `${appUrl}/order/${orderId}?paid=1`,
    cancel_url: `${appUrl}/order/${orderId}?canceled=1`,
  });

  return { sessionId: session.id, url: session.url };
}

export async function getSessionStatus(sessionId: string): Promise<'paid' | 'unpaid' | 'unknown'> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === 'paid') return 'paid';
  if (session.payment_status === 'unpaid') return 'unpaid';
  return 'unknown';
}

