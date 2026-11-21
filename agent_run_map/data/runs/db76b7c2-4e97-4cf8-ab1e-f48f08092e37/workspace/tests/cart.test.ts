import { describe, it, expect } from "vitest";
import { checkout } from "../src/cart.js";

describe("checkout", () => {
  it("calculates totals for a single item", () => {
    const result = checkout([{ name: "Hat", price: 25.0, quantity: 2 }]);
    expect(result.subtotal).toBe(50.0);
    expect(result.tax).toBe(4.0);
    expect(result.total).toBe(54.0);
    expect(result.formattedTotal).toBe("$54.00");
  });

  it("applies a discount and tax", () => {
    const result = checkout([{ name: "Jacket", price: 100.0, quantity: 1 }], 10);
    expect(result.discount).toBe(10.0);
    expect(result.total).toBe(97.2);
    expect(result.formattedTotal).toBe("$97.20");
  });
});
