import { describe, it, expect } from "vitest";
import { calculatePromos } from "../../src/modules/promos/calculate";
import type { Promo } from "../../src/modules/promos/rules";
import {
  promoRules,
  promoEligibility,
  type PromoRules,
} from "../../src/modules/promos/rules";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const rules: PromoRules = {
  name: "Halloween",
  percent: 10,
  scope: "selected",
  productIds: [a, b],
  minQuantity: 3,
  minDistinct: 1,
  minSpend: 0,
  maxDiscount: null,
  priority: 10,
  active: true,
};
const promo = (
  id: string,
  percent: number,
  priority: number,
  patch: Partial<PromoRules> = {},
): Promo => ({
  ...rules,
  scope: "all",
  productIds: [],
  minQuantity: 1,
  id,
  revision: 1,
  percent,
  priority,
  ...patch,
});
describe("sequential integer discount calculation", () => {
  it("charges 72,000 for 100,000 with 10% then 20%, regardless of cashier selection order", () => {
    const lines = [{ id: a, quantity: 1, unitPrice: 100000 }];
    const first = promo(a, 10, 1),
      second = promo(b, 20, 2, { minSpend: 100000 });
    const result = calculatePromos(lines, [second, first]);
    expect(result.discount).toBe(28000);
    expect(result.applied.map((p) => p.discount)).toEqual([10000, 18000]);
    expect(calculatePromos(lines, [first, second])).toEqual(result);
  });
  it("applies overlapping selected promos only to remaining eligible product amounts", () => {
    const result = calculatePromos(
      [
        { id: a, quantity: 1, unitPrice: 80000 },
        { id: b, quantity: 1, unitPrice: 20000 },
      ],
      [
        promo(a, 10, 1),
        promo(b, 20, 2, { scope: "selected", productIds: [a] }),
      ],
    );
    expect(result.discount).toBe(24400);
    expect(result.allocations).toEqual([
      { id: a, discount: 22400 },
      { id: b, discount: 2000 },
    ]);
  });
  it("floors each discount and respects owner caps before allocating rupiah", () => {
    const lines = [{ id: a, quantity: 1, unitPrice: 10001 }];
    expect(calculatePromos(lines, [promo(a, 15, 1)]).discount).toBe(1500);
    expect(
      calculatePromos(lines, [promo(a, 15, 1, { maxDiscount: 1000 })]).discount,
    ).toBe(1000);
  });
  it("reconciles exact allocations at large amounts and retains a positive payable total", () => {
    for (let n = 1; n <= 30; n++) {
      const lines = [
        { id: a, quantity: 9, unitPrice: 10000000 + n },
        { id: b, quantity: 1, unitPrice: 30000001 },
      ];
      const promos = Array.from({ length: 20 }, (_, i) =>
        promo(
          `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          99,
          i,
        ),
      );
      const r = calculatePromos(lines, promos);
      expect(r.discount).toBe(
        r.applied.reduce((sum, p) => sum + p.discount, 0),
      );
      expect(r.discount).toBe(
        r.allocations.reduce((sum, p) => sum + p.discount, 0),
      );
      expect(r.grossTotal - r.discount).toBeGreaterThan(0);
      for (const allocation of r.allocations) {
        const l = lines.find((l) => l.id === allocation.id)!;
        expect(allocation.discount).toBeLessThanOrEqual(
          l.unitPrice * l.quantity,
        );
        expect(Number.isInteger(allocation.discount)).toBe(true);
      }
    }
  });
  it("rejects duplicated promos and unmet configurable quantity rules", () => {
    const lines = [{ id: a, unitPrice: 10000, quantity: 1 }],
      p = promo(a, 10, 1);
    expect(() => calculatePromos(lines, [p, p])).toThrow();
    expect(() => calculatePromos(lines, [{ ...p, minQuantity: 3 }])).toThrow(
      "Minimal 3",
    );
    expect(calculatePromos(lines, []).discount).toBe(0);
  });
});
describe("owner-configured eligibility", () => {
  it("distinguishes units and different products without counting unrelated products", () => {
    const basket = [{ id: a, quantity: 3, unitPrice: 10000 }];
    expect(promoEligibility(rules, basket)).toBeNull();
    expect(promoEligibility({ ...rules, minDistinct: 2 }, basket)).toContain(
      "2 menu",
    );
    expect(promoEligibility({ ...rules, productIds: [b] }, basket)).toContain(
      "3 item",
    );
    expect(promoEligibility({ ...rules, minSpend: 30001 }, basket)).toContain(
      "30.001",
    );
    expect(promoEligibility({ ...rules, active: false }, basket)).toContain(
      "tidak aktif",
    );
  });
  it("rejects empty or duplicated product selections, invalid money and percentages", () => {
    for (const patch of [
      { percent: 0 },
      { percent: 100 },
      { percent: 1.5 },
      { maxDiscount: 0 },
      { minSpend: -1 },
      { scope: "selected", productIds: [] },
      { productIds: [a, a] },
      { scope: "all" },
      { minDistinct: 3 },
    ])
      expect(promoRules.safeParse({ ...rules, ...patch }).success).toBe(false);
    expect(promoRules.safeParse(rules).success).toBe(true);
  });
});
