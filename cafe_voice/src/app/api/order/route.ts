import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder, getOrderWithItems, addOrderItem, removeOrderItem, updateOrderStatus } from '@/lib/cafe';
import { findMenuItems, normalizeSize, normalizeOption } from '@/lib/cafe';

const createSchema = z.object({
  customer_name: z.string().min(1).max(60),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer_name } = createSchema.parse(body);
    const order = await createOrder(customer_name);
    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('Create order error:', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const order = await getOrderWithItems(id);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('Get order error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_item'), order_id: z.string().uuid(), item_name: z.string(), size: z.string().optional(), options: z.array(z.string()).optional(), qty: z.number().min(1).max(20).optional() }),
  z.object({ action: z.literal('remove_item'), order_id: z.string().uuid(), line_id: z.string().uuid() }),
  z.object({ action: z.literal('send_to_kitchen'), order_id: z.string().uuid() }),
]);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const action = patchSchema.parse(body);

    if (action.action === 'add_item') {
      const matches = await findMenuItems(action.item_name);
      const match = matches.find((m) => m.available);
      if (!match) {
        return NextResponse.json({ error: 'Item not found or unavailable' }, { status: 422 });
      }

      let size = action.size;
      if (!size) {
        size = match.sizes.length === 1 ? match.sizes[0].size : match.sizes.find((s) => s.size.toLowerCase() === 'regular')?.size || match.sizes[0].size;
      }
      const normalizedSize = normalizeSize(match, size);
      if (!normalizedSize) {
        return NextResponse.json({ error: `Size ${size} not available for ${match.name}` }, { status: 422 });
      }

      const options = (action.options || [])
        .map((o) => normalizeOption(match, o))
        .filter(Boolean) as { name: string; price: number }[];

      const order = await addOrderItem(action.order_id, match, normalizedSize, options, action.qty || 1);
      return NextResponse.json({ order });
    }

    if (action.action === 'remove_item') {
      const order = await removeOrderItem(action.order_id, action.line_id);
      return NextResponse.json({ order });
    }

    if (action.action === 'send_to_kitchen') {
      const order = await updateOrderStatus(action.order_id, 'sent_to_kitchen');
      return NextResponse.json({ order });
    }
  } catch (err: any) {
    console.error('Patch order error:', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

