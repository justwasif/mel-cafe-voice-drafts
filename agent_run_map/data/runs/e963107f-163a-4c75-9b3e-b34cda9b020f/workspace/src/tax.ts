const TAX_RATE = 0.08;

export function calculateTax(amount: number): number {
  return Math.round(amount * TAX_RATE * 100) / 100;
}
