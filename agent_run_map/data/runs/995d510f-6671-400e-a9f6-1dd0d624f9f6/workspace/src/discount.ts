/**
 * Apply a percentage discount to a price.
 */
export function applyDiscount(price: number, percent: number): number {
  if (percent <= 0) return price;
  if (percent >= 100) return 0;
  const discounted = price * (1 - percent / 100);
  return Number(discounted.toFixed(2));
}
