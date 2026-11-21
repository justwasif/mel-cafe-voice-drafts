import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth';
import {
  getPurchaseOrderById,
  getPoLines,
  updatePurchaseOrder,
  getSupplierById,
  addToOutbox,
  getOutboxEntries,
} from '@/lib/db';
import { renderPoPdf } from '@/lib/agent';


const bodySchema = z.object({
  po_id: z.string().uuid(),
  lines: z.array(z.object({
    id: z.string().uuid().optional(),
    qty: z.number().int().min(0),
  })).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (user instanceof NextResponse) return user;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { po_id, lines: lineUpdates } = parsed.data;
  const po = await getPurchaseOrderById(po_id);
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

  // Idempotent: approving an already-approved PO does nothing new
  if (po.status === 'approved') {
    return NextResponse.json({ ok: true, po, message: 'Already approved' });
  }
  if (po.status === 'rejected') {
    return NextResponse.json({ error: 'Cannot approve a rejected PO' }, { status: 400 });
  }

  let finalPo = po;
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: process.env.STORE_TIMEZONE || 'UTC' }));
  const currency = process.env.STORE_CURRENCY || 'USD';

  try {
    // If line quantities were edited, re-round and recalc
    if (lineUpdates && lineUpdates.length > 0) {
      const existingLines = await getPoLines(po.id);
      const supplier = await getSupplierById(po.supplier_id);
      const updatedLines = existingLines.map(l => {
        const update = lineUpdates.find(u => u.id === l.id);
        if (!update) return l;
        let qty = update.qty;
        // Re-round up to case pack, raise to MOQ
        if (qty > 0) {
          if (supplier.case_pack > 1) {
            qty = Math.ceil(qty / supplier.case_pack) * supplier.case_pack;
          }
          if (qty < supplier.moq) qty = supplier.moq;
        }
        return { ...l, qty, line_total: Math.round(l.unit_cost * qty * 100) / 100 };
      });
      // Replace lines
      const { replacePoLines, recalcPoTotals } = await import('@/lib/db');
      await replacePoLines(po.id, updatedLines.map(l => ({
        shopify_variant_id: l.shopify_variant_id,
        supplier_sku: l.supplier_sku,
        item_name: l.item_name,
        size: l.size,
        qty: l.qty,
        unit_cost: l.unit_cost,
        line_total: l.line_total,
      })));
      finalPo = await recalcPoTotals(po.id);
    }

    // Approve
    finalPo = await updatePurchaseOrder(po.id, {
      status: 'approved',
      approved_by: (user as any).email ?? 'owner',
      approved_at: new Date().toISOString(),
    });

    // Render final PDF without watermark
    const supplier = await getSupplierById(po.supplier_id);
    const lines = await getPoLines(po.id);
    const pdfPath = await renderPoPdf(finalPo, supplier, lines, today, currency, finalPo.why_note, false);
    finalPo = await updatePurchaseOrder(po.id, { pdf_path: pdfPath });

    // Add to Outbox (the email that would be sent — never actually sent)
    const existingOutbox = await getOutboxEntries();
    const alreadyOutboxed = existingOutbox.some(e => e.po_id === po.id);
    if (!alreadyOutboxed) {
      const lineSummary = lines
        .map(l => `  • ${l.item_name} ${l.size}: ${l.qty} units @ $${Number(l.unit_cost).toFixed(2)} = $${Number(l.line_total).toFixed(2)}`)
        .join('\n');
      await addToOutbox({
        po_id: po.id,
        to_email: supplier.email,
        subject: `Purchase Order ${finalPo.po_number} — Northwind Supply Co.`,
        body: `Hello ${supplier.name},\n\nPlease process the following purchase order.\n\nPO: ${finalPo.po_number}\nRequired by: ${new Date(today.getTime() + supplier.lead_time_days * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\n${lineSummary}\n\nTotal: ${currency === 'USD' ? '$' : ''}${Number(finalPo.total).toFixed(2)}\n\nTerms: Net 30.\n\nThank you,\nNorthwind Supply Co.\n\n(Demo: this email was not actually sent.)`,
        pdf_path: pdfPath,
      });
    }

    return NextResponse.json({ ok: true, po: finalPo });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Approval failed' }, { status: 500 });
  }
}
