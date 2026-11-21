import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { runAgent } from '@/lib/agent';


export async function POST(_req: NextRequest) {
  const auth = await requireOwner();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await runAgent();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Agent run failed' }, { status: 500 });
  }
}
