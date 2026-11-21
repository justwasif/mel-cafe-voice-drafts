import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getOrderWithItems, updateOrderStatus } from '@/lib/cafe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const payload = await req.text();
    const signature = (await headers()).get('stripe-signature') || '';
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        const order = await getOrderWithItems(orderId);
        if (order && order.status !== 'paid' && order.status !== 'ready') {
          await updateOrderStatus(orderId, 'paid', { paid_at: new Date().toISOString() });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

