import { NextRequest, NextResponse } from 'next/server';
import { getOrderWithItems } from '@/lib/cafe';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await getOrderWithItems(id);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('Order status error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

