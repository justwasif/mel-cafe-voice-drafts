# tiny-shop

A small fake shop used to demonstrate Agent Run Map.

## Files

- `src/cart.ts` — checkout logic
- `src/discount.ts` — discount calculation (contains an intentional bug)
- `src/tax.ts` — tax calculation
- `src/format.ts` — price formatting
- `src/index.ts` — CLI entry point
- `tests/*.test.ts` — Vitest tests

## Bug

`applyDiscount` rounds the price before applying the percentage, so
`applyDiscount(99.99, 10)` returns `$90.00` instead of `$89.99`.
