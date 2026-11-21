import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getOrderWithItems, updateOrderStatus, logEvent } from '@/lib/cafe';
import { createCheckoutSession } from '@/lib/stripe';

const schema = z.object({ order_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { order_id: orderId } = schema.parse(body);

    const order = await getOrderWithItems(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === 'rejected') {
      return NextResponse.json({ error: 'Order was rejected' }, { status: 422 });
    }

    if (order.status === 'payment_link_sent' || order.status === 'paid' || order.status === 'ready') {
      return NextResponse.json({ order });
    }

    const availableItems = order.items.filter((i) => !i.unavailable);
    if (availableItems.length === 0) {
      return NextResponse.json({ error: 'No available items to confirm' }, { status: 422 });
    }

    const lineItems = availableItems.map((i) => ({
      name: `${i.name} (${i.size})`,
      amount: i.unit_price + i.options.reduce((sum, o) => sum + o.price, 0),
      qty: i.qty,
    }));

    const appUrl = process.env.APP_URL || 'http://localhost:3011';
    const { sessionId, url } = await createCheckoutSession(order.id, order.order_number, lineItems, appUrl);

    const updated = await updateOrderStatus(orderId, 'payment_link_sent', {
      stripe_session_id: sessionId,
      stripe_url: url,
    });

    await logEvent(orderId, 'confirmed', { staff_id: userData.user.id, stripe_session_id: sessionId });

    return NextResponse.json({ order: updated });
  } catch (err: any) {
    console.error('Confirm order error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

