import { applyDiscount } from "./discount.js";
import { calculateTax } from "./tax.js";
import { formatPrice } from "./format.js";

export interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutResult {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  formattedTotal: string;
}

export function checkout(
  items: CartItem[],
  discountPercent: number = 0
): CheckoutResult {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discounted = applyDiscount(subtotal, discountPercent);
  const tax = calculateTax(discounted);
  const total = discounted + tax;

  return {
    subtotal,
    discount: subtotal - discounted,
    tax,
    total,
    formattedTotal: formatPrice(total),
  };
}
