export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatCurrencyCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
