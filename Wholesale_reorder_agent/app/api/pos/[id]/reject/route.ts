import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth';
import { getPurchaseOrderById, updatePurchaseOrder } from '@/lib/db';


const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const po = await getPurchaseOrderById(id);
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  if (po.status === 'approved') {
    return NextResponse.json({ error: 'Cannot reject an approved PO' }, { status: 400 });
  }

  const updated = await updatePurchaseOrder(id, {
    status: 'rejected',
    rejected_reason: parsed.data.reason ?? null,
  });

  return NextResponse.json({ ok: true, po: updated });
}
