import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase-server';
import { approveRequest } from '@/lib/approval';

const bodySchema = z.object({
  reference: z.string().regex(/^AR-[A-Z0-9]{6}$/),
});

export async function POST(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const result = await approveRequest(parsed.data.reference);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
