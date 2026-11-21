import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { setItemUnavailable, logEvent } from '@/lib/cafe';

const schema = z.object({ order_id: z.string().uuid(), item_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { order_id: orderId, item_id: itemId } = schema.parse(body);

    const order = await setItemUnavailable(orderId, itemId, true);
    await logEvent(orderId, 'item_unavailable', { item_id: itemId, staff_id: userData.user.id });

    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('Item unavailable error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

