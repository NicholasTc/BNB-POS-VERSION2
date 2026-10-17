import { describe, it, expect } from "vitest";
import { priceLines, rupiah } from "../../src/lib/money";
describe("integer rupiah", () => {
  it("sums line quantities without floating point", () =>
    expect(
      priceLines([
        { unitPrice: 18000, quantity: 2 },
        { unitPrice: 12500, quantity: 3 },
      ]),
    ).toBe(73500));
  it("rejects fractional, zero, negative, excessive and overflowing values", () => {
    for (const line of [
      { unitPrice: 1.5, quantity: 1 },
      { unitPrice: 18000, quantity: 0 },
      { unitPrice: 18000, quantity: 1.5 },
      { unitPrice: -1, quantity: 1 },
      { unitPrice: 100000000, quantity: 99 },
    ])
      expect(() => priceLines([line])).toThrow();
    expect(() => priceLines([])).toThrow();
  });
  it("formats Indonesian currency", () =>
    expect(rupiah(18000)).toMatch(/Rp\s*18\.000/));
});
