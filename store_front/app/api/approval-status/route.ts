import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestStatus } from '@/lib/tools';

const querySchema = z.object({
  reference: z.string().regex(/^AR-[A-Z0-9]{6}$/),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ reference: searchParams.get('reference') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 });
  }

  const status = await requestStatus(parsed.data.reference);
  return NextResponse.json(status);
}
