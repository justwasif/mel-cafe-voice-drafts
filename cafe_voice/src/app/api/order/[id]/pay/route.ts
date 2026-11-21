import { NextRequest, NextResponse } from 'next/server';
import { getSessionStatus } from '@/lib/stripe';
import { getOrderWithItems, updateOrderStatus } from '@/lib/cafe';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await getOrderWithItems(id);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!order.stripe_session_id) {
      return NextResponse.json({ status: order.status });
    }

    const status = await getSessionStatus(order.stripe_session_id);
    if (status === 'paid' && order.status !== 'paid' && order.status !== 'ready') {
      await updateOrderStatus(id, 'paid');
      return NextResponse.json({ status: 'paid' });
    }

    return NextResponse.json({ status: order.status });
  } catch (err: any) {
    console.error('Pay status error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

