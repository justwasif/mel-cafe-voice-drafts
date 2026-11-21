import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getOutboxEntries, getPurchaseOrders, getPoLines } from '@/lib/db';


export async function GET(_req: NextRequest) {
  const auth = await requireOwner();
  if (auth instanceof NextResponse) return auth;

  const [entries, pos] = await Promise.all([getOutboxEntries(), getPurchaseOrders()]);
  const poById = new Map(pos.map(p => [p.id, p]));

  const result = await Promise.all(
    entries.map(async e => {
      const po = poById.get(e.po_id);
      const lines = po ? await getPoLines(po.id) : [];
      return { ...e, po, lines };
    }),
  );

  return NextResponse.json({ entries: result });
}
