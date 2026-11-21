// Pure, tested forecast functions. No I/O, no side effects.
// All numbers come from code, never from a model.

export type Status = 'Order now' | 'Watch' | 'OK' | 'No sales';

export interface Supplier {
  id: string;
  name: string;
  email: string;
  lead_time_days: number;
  moq: number;
  case_pack: number;
}

export interface DailySale {
  date: string; // ISO date yyyy-mm-dd
  quantity: number;
}

export interface VariantForecast {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  rate: number; // units/day
  days_of_cover: number;
  run_out_date: string | null; // ISO date yyyy-mm-dd
  reorder_point: number;
  status: Status;
  suggested_qty: number;
  supplier_id: string;
}

const LN2 = Math.LN2;
const SAFETY_DAYS = 7;
const RATE_WINDOW_DAYS = 28;
const RATE_HALF_LIFE_DAYS = 7;
const TARGET_COVER_DAYS = 45;

// alpha for a discrete EWMA with the given half-life over daily samples
const ALPHA = 1 - Math.exp(-LN2 / RATE_HALF_LIFE_DAYS); // ≈ 0.0943

/**
 * Exponentially weighted moving average of the last 28 days of sales.
 * Most recent day has the highest weight. Returns units/day.
 * If there are no sales in the window, returns 0.
 */
export function salesRate(sales: DailySale[], today: Date): number {
  const todayMs = startOfDay(today).getTime();
  const dayMs = 86_400_000;

  let weightedSum = 0;
  let weightSum = 0;
  let hasSales = false;

  for (let daysAgo = 1; daysAgo <= RATE_WINDOW_DAYS; daysAgo++) {
    const dateMs = todayMs - daysAgo * dayMs;
    const dateStr = toDateStr(new Date(dateMs));
    const sale = sales.find(s => s.date === dateStr);
    const qty = sale?.quantity ?? 0;
    if (qty > 0) hasSales = true;

    const weight = ALPHA * Math.pow(1 - ALPHA, daysAgo - 1);
    weightedSum += qty * weight;
    weightSum += weight;
  }

  if (!hasSales) return 0;
  // Normalize by weightSum so the EWMA represents per-day rate
  return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * Days of cover: on-hand divided by sales rate.
 * Infinity if rate is 0 (handled by callers via No-sales status).
 */
export function daysOfCover(onHand: number, rate: number): number {
  if (rate <= 0) return Infinity;
  return onHand / rate;
}

/**
 * Run-out date = today + ceil(days of cover), in the given timezone.
 * Returns null when the variant never sells.
 */
export function runOutDate(onHand: number, rate: number, today: Date): string | null {
  if (rate <= 0) return null;
  const days = Math.ceil(onHand / rate);
  const d = startOfDay(today);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/**
 * Reorder point = rate × (supplier lead time + 7 safety days).
 */
export function reorderPoint(rate: number, leadTimeDays: number): number {
  return rate * (leadTimeDays + SAFETY_DAYS);
}

/**
 * Status classification.
 */
export function classifyStatus(
  onHand: number,
  rate: number,
  leadTimeDays: number,
): Status {
  if (rate <= 0) return 'No sales';
  const rp = reorderPoint(rate, leadTimeDays);
  if (onHand <= rp) return 'Order now';
  // Watch if within 7 days-of-rate of the reorder point
  if (onHand <= rp + SAFETY_DAYS * rate) return 'Watch';
  return 'OK';
}

/**
 * Round a quantity up to the case pack.
 */
export function roundToCasePack(qty: number, casePack: number): number {
  if (casePack <= 1) return Math.ceil(qty);
  return Math.ceil(qty / casePack) * casePack;
}

/**
 * Suggested reorder quantity.
 *
 * baseNeed = rate × (leadTime + 45 target days) + reorderPoint − onHand − onOrder
 * suggested = roundToCasePack(max(baseNeed, 0), casePack)
 * if suggested < moq: suggested = moq (only when baseNeed > 0)
 * Never negative. Returns 0 when baseNeed ≤ 0.
 */
export function suggestedQty(
  rate: number,
  leadTimeDays: number,
  casePack: number,
  moq: number,
  onHand: number,
  onOrder: number,
): number {
  const rp = reorderPoint(rate, leadTimeDays);
  const baseNeed =
    rate * (leadTimeDays + TARGET_COVER_DAYS) + rp - onHand - onOrder;
  if (baseNeed <= 0) return 0;
  let suggested = roundToCasePack(baseNeed, casePack);
  if (suggested < moq) suggested = moq;
  return suggested;
}

// --- date helpers ---

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Full forecast for one variant.
 */
export function forecastVariant(args: {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  sales: DailySale[];
  supplier: Supplier;
  today: Date;
  on_order: number;
}): VariantForecast {
  const rate = salesRate(args.sales, args.today);
  const status = classifyStatus(args.on_hand, rate, args.supplier.lead_time_days);
  const suggested =
    status === 'No sales'
      ? 0
      : suggestedQty(
          rate,
          args.supplier.lead_time_days,
          args.supplier.case_pack,
          args.supplier.moq,
          args.on_hand,
          args.on_order,
        );
  return {
    shopify_variant_id: args.shopify_variant_id,
    product_title: args.product_title,
    size: args.size,
    on_hand: args.on_hand,
    rate: round(rate, 2),
    days_of_cover: rate > 0 ? round(daysOfCover(args.on_hand, rate), 1) : Infinity,
    run_out_date: runOutDate(args.on_hand, rate, args.today),
    reorder_point: round(reorderPoint(rate, args.supplier.lead_time_days), 1),
    status,
    suggested_qty: suggested,
    supplier_id: args.supplier.id,
  };
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
