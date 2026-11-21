import { formatInTimeZone } from 'date-fns-tz';

const TZ = process.env.STORE_TIMEZONE || 'UTC';

export function checkRefundEligibility(order: any, email: string) {
  const customerEmail = order.customer?.email?.toLowerCase()?.trim();
  if (customerEmail !== email.toLowerCase().trim()) {
    return { eligible: false, reason: 'Order not found.' };
  }
  if (order.displayFinancialStatus !== 'PAID') {
    return { eligible: false, reason: 'This order is not eligible for a refund.' };
  }
  const daysOld = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld > 30) {
    return { eligible: false, reason: 'This order is outside the 30-day return window.' };
  }
  if ((order.refunds?.length ?? 0) > 0) {
    return { eligible: false, reason: 'This order has already been refunded.' };
  }
  return { eligible: true, reason: '' };
}

export function checkDiscountCap(percent: number) {
  if (percent > 15) return { ok: false, reason: 'Discount cannot exceed 15%.' };
  return { ok: true, reason: '' };
}

export function formatOrderReply(order: any, found: boolean) {
  if (!found || !order) return "I couldn't find that order.";
  const lines = [
    `Order ${order.name} — ${order.financialStatus?.toLowerCase?.() || order.financialStatus}.`,
    `Placed on ${formatInTimeZone(new Date(order.createdAt), TZ, 'yyyy-MM-dd HH:mm')}.`,
    `Total: ${order.total}.`,
  ];
  if (order.fulfillmentStatus?.toUpperCase() === 'FULFILLED' && order.fulfillments?.length) {
    const f = order.fulfillments[0];
    lines.push(`Shipped with ${f.carrier || 'carrier'}, tracking ${f.tracking || 'N/A'}.`);
  } else if (order.fulfillmentStatus?.toUpperCase() === 'PARTIALLY_FULFILLED') {
    lines.push('Partially shipped — some items are still being prepared.');
  } else {
    lines.push('Not shipped yet — we’ll send tracking as soon as it leaves.');
  }
  if (order.refunds?.length) {
    lines.push(`Refunded: ${order.refunds.map((r: any) => `${r.amount} ${r.currency}`).join(', ')}.`);
  }
  return lines.join(' ');
}

export function buildApprovalReference() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = 'AR-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}
