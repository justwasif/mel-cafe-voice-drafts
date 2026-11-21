import { z } from 'zod';
import { getOrderByName, getProducts } from './shopify';
import { supabaseAdmin } from './supabase-admin';
import { checkRefundEligibility, checkDiscountCap, buildApprovalReference } from './logic';

const env = z.object({
  STORE_TIMEZONE: z.string().default('UTC'),
}).parse(process.env);

export async function lookupOrder(orderNumber: string, email: string) {
  const order = await getOrderByName(orderNumber);
  if (!order) return { found: false };
  const customerEmail = order.customer?.email?.toLowerCase()?.trim();
  const providedEmail = email.toLowerCase().trim();
  if (customerEmail !== providedEmail) {
    return { found: false, reason: 'email_mismatch' };
  }

  const total = order.totalPriceSet?.shopMoney;
  const items = order.lineItems?.edges?.map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    variant: e.node.variant?.title,
    quantity: e.node.quantity,
    price: e.node.variant?.price,
    image: e.node.image?.url ?? null,
    refundable: e.node.refundableQuantity,
  })) ?? [];

  const fulfillments = (order.fulfillments ?? []).map((f: any) => ({
    tracking: f.trackingInfo?.[0]?.number ?? (Array.isArray(f.trackingInfo) ? f.trackingInfo[0]?.number : f.trackingInfo?.number),
    carrier: f.trackingInfo?.[0]?.company ?? (Array.isArray(f.trackingInfo) ? f.trackingInfo[0]?.company : f.trackingInfo?.company),
  }));

  const refunds = (order.refunds ?? []).map((r: any) => ({
    amount: r.totalRefundedSet?.shopMoney?.amount,
    currency: r.totalRefundedSet?.shopMoney?.currencyCode,
  }));

  return {
    found: true,
    name: order.name,
    createdAt: order.createdAt,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    total: total ? `${total.amount} ${total.currencyCode}` : null,
    items,
    fulfillments,
    refunds,
  };
}

export async function sizeHelp(productQuery: string, measurements?: { chest?: number; waist?: number }) {
  const products = await getProducts(productQuery);
  if (!products.length) return { found: false };
  const product = products[0];
  const variants = product.variants?.edges?.map((e: any) => ({
    size: e.node.selectedOptions?.find((o: any) => o.name === 'Size')?.value,
    price: e.node.price,
    stock: e.node.inventoryQuantity,
  })) ?? [];

  const chartMeta = product.metafields?.edges?.find(
    (e: any) => e.node.namespace === 'custom' && e.node.key === 'size_chart'
  );
  let chart: Record<string, any> | null = null;
  try {
    chart = chartMeta ? JSON.parse(chartMeta.node.value) : null;
  } catch {
    chart = null;
  }

  let recommendation = null;
  if (measurements?.chest && chart) {
    const sorted = Object.entries(chart).sort((a, b) => (a[1].chest.cm as number) - (b[1].chest.cm as number));
    for (const [size, dims] of sorted) {
      if ((dims.chest.cm as number) >= measurements.chest) {
        recommendation = size;
        break;
      }
    }
    if (!recommendation) recommendation = sorted[sorted.length - 1]?.[0];
  }

  return {
    found: true,
    product: product.title,
    image: product.featuredImage?.url ?? null,
    variants,
    chart,
    recommendation,
  };
}

export async function getPolicy(topic: string) {
  const { data, error } = await supabaseAdmin
    .from('store_policies')
    .select('text')
    .eq('key', topic)
    .single();
  if (error || !data) {
    const { data: fallback } = await supabaseAdmin
      .from('store_policies')
      .select('text')
      .eq('key', 'returns')
      .single();
    return { text: fallback?.text ?? 'Policy not available.' };
  }
  return { text: data.text };
}

export async function requestRefund(orderNumber: string, email: string, lineItems: Array<{ lineItemId: string; quantity: number }>, reason: string) {
  const order = await getOrderByName(orderNumber);
  if (!order) return { ok: false, error: 'Order not found.' };

  const eligibility = checkRefundEligibility(order, email);
  if (!eligibility.eligible) return { ok: false, error: eligibility.reason };

  const total = order.totalPriceSet?.shopMoney;
  const ref = buildApprovalReference();

  const { data: existing } = await supabaseAdmin
    .from('approval_requests')
    .select('id')
    .eq('shopify_order_id', order.id)
    .eq('type', 'refund')
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) return { ok: false, error: 'A refund request for this order is already pending.' };

  const { data, error } = await supabaseAdmin.from('approval_requests').insert({
    reference: ref,
    type: 'refund',
    shopify_order_id: order.id,
    order_name: order.name,
    customer_email: email,
    amount: total?.amount,
    currency: total?.currencyCode,
    line_items: lineItems,
    reason,
    ai_summary: `Refund request for ${order.name} — ${reason}`,
    status: 'pending',
  }).select().single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, reference: data.reference, amount: data.amount, currency: data.currency };
}

export async function proposeDiscount(orderNumber: string, email: string, percent: number, reason: string) {
  const cap = checkDiscountCap(percent);
  if (!cap.ok) return { ok: false, error: cap.reason };

  const order = await getOrderByName(orderNumber);
  if (!order) return { ok: false, error: 'Order not found.' };
  const customerEmail = order.customer?.email?.toLowerCase()?.trim();
  if (customerEmail !== email.toLowerCase().trim()) {
    return { ok: false, error: 'Order not found.' };
  }

  const ref = buildApprovalReference();

  const { data: existing } = await supabaseAdmin
    .from('approval_requests')
    .select('id')
    .eq('shopify_order_id', order.id)
    .eq('type', 'discount')
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) return { ok: false, error: 'A discount request for this order is already pending.' };

  const { data, error } = await supabaseAdmin.from('approval_requests').insert({
    reference: ref,
    type: 'discount',
    shopify_order_id: order.id,
    order_name: order.name,
    customer_email: email,
    discount_percent: percent,
    reason,
    ai_summary: `Discount ${percent}% for ${order.name} — ${reason}`,
    status: 'pending',
  }).select().single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, reference: data.reference };
}

export async function requestStatus(reference: string) {
  const { data, error } = await supabaseAdmin
    .from('approval_requests')
    .select('status, shopify_result, error, decision_note, decided_at')
    .eq('reference', reference)
    .single();
  if (error || !data) return { status: 'not_found' };
  return {
    status: data.status,
    result: data.shopify_result,
    error: data.error,
    decisionNote: data.decision_note,
    decidedAt: data.decided_at,
  };
}
