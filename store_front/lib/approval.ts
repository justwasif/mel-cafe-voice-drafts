import { supabaseAdmin } from './supabase-admin';
import { createRefund, createDiscountCode } from './shopify';
import { addDays, formatISO } from 'date-fns';

export async function approveRequest(reference: string) {
  const { data: req, error } = await supabaseAdmin
    .from('approval_requests')
    .select('*')
    .eq('reference', reference)
    .eq('status', 'pending')
    .maybeSingle();

  if (error || !req) return { ok: false, error: 'Request not found or already decided.' };

  if (req.type === 'refund') {
    const refundLineItems = (req.line_items as Array<{ lineItemId: string; quantity: number }>)?.map(li => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
      restockType: 'NO_RESTOCK',
    })) ?? [];
    try {
      const result = await createRefund(req.shopify_order_id, refundLineItems, req.currency || 'USD', Number(req.amount));
      if (result.userErrors?.length) throw new Error(result.userErrors.map((e: any) => e.message).join('; '));
      const refunded = result.refund?.totalRefundedSet?.shopMoney;
      // Never report "approved" unless Shopify actually moved money.
      if (!refunded || !(Number(refunded.amount) > 0)) throw new Error('Shopify recorded the refund with a $0 amount.');
      const shopifyResult = { refundId: result.refund.id, amount: Number(refunded.amount).toFixed(2), currency: refunded.currencyCode };
      await supabaseAdmin.from('approval_requests').update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        shopify_result: shopifyResult,
      }).eq('reference', reference);
      return { ok: true, result: shopifyResult };
    } catch (err: any) {
      await supabaseAdmin.from('approval_requests').update({
        status: 'failed',
        decided_at: new Date().toISOString(),
        error: err.message,
      }).eq('reference', reference);
      return { ok: false, error: err.message };
    }
  }

  if (req.type === 'discount') {
    const code = `SORRY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const expiresAt = formatISO(addDays(new Date(), 30));
    try {
      const result = await createDiscountCode(req.discount_percent, code, expiresAt);
      if (result.userErrors?.length) throw new Error(result.userErrors.map((e: any) => e.message).join('; '));
      const discountCode = result.codeDiscountNode?.codeDiscount?.codes?.edges?.[0]?.node?.code || code;
      await supabaseAdmin.from('approval_requests').update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        shopify_result: { code: discountCode },
      }).eq('reference', reference);
      return { ok: true, result: { code: discountCode } };
    } catch (err: any) {
      await supabaseAdmin.from('approval_requests').update({
        status: 'failed',
        decided_at: new Date().toISOString(),
        error: err.message,
      }).eq('reference', reference);
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: 'Unknown request type.' };
}

export async function rejectRequest(reference: string, note?: string) {
  const { error } = await supabaseAdmin
    .from('approval_requests')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq('reference', reference)
    .eq('status', 'pending');

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
