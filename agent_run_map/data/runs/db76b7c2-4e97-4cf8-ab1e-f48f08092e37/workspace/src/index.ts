import { checkout, CartItem } from "./cart.js";

const items: CartItem[] = [
  { name: "T-Shirt", price: 29.99, quantity: 1 },
  { name: "Hoodie", price: 59.99, quantity: 1 },
];

const result = checkout(items, 10);
console.log(result.formattedTotal);
