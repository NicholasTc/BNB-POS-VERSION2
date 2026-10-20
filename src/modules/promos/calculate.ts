import { priceLines } from "@/lib/money";
import {
  promoEligibility,
  promoRules,
  type Promo,
  type PromoLine,
  type DiscountSnapshot,
} from "./rules";

/** Integer-rupiah, sequential percentage discounts. Largest-remainder allocation
 * preserves exact report reconciliation; BigInt avoids unsafe intermediate
 * discount * line-value products. Stable IDs break equal-priority/tied remainders. */
export function calculatePromos(
  lines: PromoLine[],
  promos: Promo[],
): DiscountSnapshot {
  const grossTotal = priceLines(lines);
  if (
    new Set(lines.map((l) => l.id)).size !== lines.length ||
    promos.length > 20 ||
    new Set(promos.map((p) => p.id)).size !== promos.length
  )
    throw new Error("Pilihan promo atau menu tidak valid.");
  const remaining = lines.map((l) => ({
    ...l,
    amount: l.quantity * l.unitPrice,
  }));
  const applied: DiscountSnapshot["applied"] = [];
  for (const p of [...promos].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  )) {
    const { id, revision, ...configuration } = p;
    const rules = promoRules.parse(configuration);
    const reason = promoEligibility(rules, lines);
    if (reason) throw new Error(`${p.name}: ${reason}`);
    const eligible = remaining.filter(
      (l) => p.scope === "all" || p.productIds.includes(l.id),
    );
    const base = eligible.reduce((n, l) => n + l.amount, 0);
    const discount = Math.min(
      Math.floor((base * p.percent) / 100),
      p.maxDiscount ?? grossTotal,
    );
    if (base > 0 && discount > 0) {
      const portions = eligible
        .map((l) => {
          const product = BigInt(discount) * BigInt(l.amount),
            divisor = BigInt(base);
          return {
            line: l,
            value: Number(product / divisor),
            remainder: product % divisor,
          };
        })
        .sort((a, b) =>
          a.remainder === b.remainder
            ? a.line.id.localeCompare(b.line.id)
            : a.remainder > b.remainder
              ? -1
              : 1,
        );
      let extra = discount - portions.reduce((n, p) => n + p.value, 0);
      for (const part of portions) {
        const bonus = extra > 0 ? 1 : 0;
        extra -= bonus;
        part.line.amount -= part.value + bonus;
      }
    }
    applied.push({
      id,
      name: p.name,
      percent: p.percent,
      revision,
      discount,
      rules,
    });
  }
  const allocations = remaining.map((l) => ({
    id: l.id,
    discount: l.unitPrice * l.quantity - l.amount,
  }));
  return {
    grossTotal,
    discount: allocations.reduce((n, l) => n + l.discount, 0),
    applied,
    allocations,
  };
}
