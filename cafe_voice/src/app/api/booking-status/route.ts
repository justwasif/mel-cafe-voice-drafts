import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// Returns only the status of a booking by reference.
// This is safe for anon guests: they already know their own reference (LT-1234),
// and we return no personal data — just the status and reference.
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('reference');
  const parsed = z.string().regex(/^LT-[A-Z0-9]{6}$/).safeParse(ref);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('reference, status, starts_at, party_size, guest_name, notes, table_id')
    .eq('reference', parsed.data)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Resolve table label
  const { data: table } = await supabaseAdmin
    .from('dining_tables')
    .select('label')
    .eq('id', data.table_id)
    .single();

  return NextResponse.json({
    reference: data.reference,
    status: data.status,
    starts_at: data.starts_at,
    party_size: data.party_size,
    guest_name: data.guest_name,
    notes: data.notes,
    table_label: table?.label || null,
  });
}
