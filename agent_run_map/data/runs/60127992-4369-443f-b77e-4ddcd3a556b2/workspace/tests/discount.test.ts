import { describe, it, expect } from "vitest";
import { applyDiscount } from "../src/discount.js";

describe("applyDiscount", () => {
  it("returns the original price when percent is 0", () => {
    expect(applyDiscount(99.99, 0)).toBe(99.99);
  });

  it("returns 0 when percent is 100", () => {
    expect(applyDiscount(99.99, 100)).toBe(0);
  });

  it("applies a 10% discount without rounding first", () => {
    // $99.99 - 10% = $89.991, rounded to $89.99
    expect(applyDiscount(99.99, 10)).toBe(89.99);
  });

  it("applies a 20% discount", () => {
    expect(applyDiscount(50.0, 20)).toBe(40.0);
  });
});
