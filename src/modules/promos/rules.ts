import { z } from "zod";

export const promoRules = z
  .object({
    name: z.string().trim().min(1).max(80),
    percent: z.number().int().min(1).max(99),
    productIds: z.array(z.uuid()).max(200),
    scope: z.enum(["all", "selected"]),
    minQuantity: z.number().int().min(1).max(4950),
    minDistinct: z.number().int().min(1).max(50),
    minSpend: z.number().int().min(0).max(1000000000),
    maxDiscount: z.number().int().min(1).max(1000000000).nullable(),
    priority: z.number().int().min(0).max(999),
    active: z.boolean(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      new Set(p.productIds).size !== p.productIds.length ||
      (p.scope === "selected" &&
        (!p.productIds.length || p.minDistinct > p.productIds.length)) ||
      (p.scope === "all" && p.productIds.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Periksa pilihan menu dan syarat promo.",
      });
  });
export type PromoRules = z.infer<typeof promoRules>;
export type Promo = PromoRules & { id: string; revision: number };
export const promoSelection = z
  .array(
    z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict(),
  )
  .max(20)
  .refine((p) => new Set(p.map((i) => i.id)).size === p.length);
export type PromoSelection = z.infer<typeof promoSelection>;
export type PromoLine = { id: string; quantity: number; unitPrice: number };
export type AppliedPromo = {
  id: string;
  name: string;
  percent: number;
  revision: number;
  discount: number;
  rules: PromoRules;
};
export type DiscountSnapshot = {
  grossTotal: number;
  discount: number;
  applied: AppliedPromo[];
  allocations: { id: string; discount: number }[];
};

// Eligibility always uses the original basket; a preceding promo cannot change
// quantity/spend qualification. Selected scope counts only selected products.
export function promoEligibility(
  p: PromoRules,
  lines: PromoLine[],
): string | null {
  if (!p.active) return "Promo tidak aktif";
  const eligible = lines.filter(
    (l) => p.scope === "all" || p.productIds.includes(l.id),
  );
  if (eligible.reduce((n, l) => n + l.quantity, 0) < p.minQuantity)
    return `Minimal ${p.minQuantity} item yang sesuai`;
  if (eligible.length < p.minDistinct)
    return `Minimal ${p.minDistinct} menu berbeda`;
  if (lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0) < p.minSpend)
    return `Belanja minimal Rp${p.minSpend.toLocaleString("id-ID")}`;
  return null;
}
