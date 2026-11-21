import { describe, it, expect } from "vitest";
import { formatPrice, formatCurrencyCents } from "../src/format.js";

describe("format", () => {
  it("formats a price", () => {
    expect(formatPrice(12.5)).toBe("$12.50");
  });

  it("formats cents", () => {
    expect(formatCurrencyCents(1250)).toBe("$12.50");
  });
});
