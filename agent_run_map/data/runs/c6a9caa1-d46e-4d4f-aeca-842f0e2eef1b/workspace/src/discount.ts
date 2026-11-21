/**
 * Apply a percentage discount to a price.
 *
 * BUG: rounds before applying the percentage, so $99.99 with 10% off
 * returns $90.00 instead of $89.99.
 */
export function applyDiscount(price: number, percent: number): number {
  if (percent <= 0) return price;
  if (percent >= 100) return 0;
  const discounted = price * (1 - percent / 100);
  return Math.round(discounted * 100) / 100;
}
