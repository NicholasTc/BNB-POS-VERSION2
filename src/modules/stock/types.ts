import { z } from "zod";

const quantity = z.number().int().min(0).max(1000000000);
const name = z.string().trim().min(1).max(80);
export const recipeLines = z
  .array(
    z
      .object({
        stockItemId: z.uuid(),
        quantity: z.number().int().min(1).max(1000000),
      })
      .strict(),
  )
  .max(20)
  .refine(
    (lines) => new Set(lines.map((l) => l.stockItemId)).size === lines.length,
  );
export const stockCommand = z.discriminatedUnion("action", [
  z
    .object({
      id: z.uuid(),
      action: z.literal("create"),
      name,
      unit: z.enum(["pcs", "pack"]),
      openingQuantity: quantity,
      lowThreshold: quantity,
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      action: z.literal("edit"),
      stockItemId: z.uuid(),
      revision: z.number().int().positive(),
      name,
      lowThreshold: quantity,
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      action: z.literal("restock"),
      stockItemId: z.uuid(),
      quantity: quantity.refine((n) => n > 0),
      reason: z.string().trim().max(200),
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      action: z.literal("adjust"),
      stockItemId: z.uuid(),
      revision: z.number().int().positive(),
      quantity,
      reason: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      action: z.literal("recipe"),
      menuItemId: z.uuid(),
      revision: z.number().int().nonnegative(),
      lines: recipeLines,
    })
    .strict(),
  z.object({ id: z.uuid(), action: z.literal("abandon") }).strict(),
]);
export type StockCommand = z.infer<typeof stockCommand>;
export type StockResult = {
  id: string;
  action: StockCommand["action"];
  stockItemId?: string;
  menuItemId?: string;
  balance?: number;
};
export type StockItem = {
  id: string;
  name: string;
  unit: "pcs" | "pack";
  balance: number;
  lowThreshold: number;
  revision: number;
};
export type StockData = {
  items: StockItem[];
  lowCount: number;
  negativeCount: number;
};
export type StockRecipe = {
  menuItemId: string;
  revision: number;
  lines: { stockItemId: string; quantity: number }[];
};
export type StockMovement = {
  id: string;
  stockItemId: string;
  name: string;
  unit: string;
  kind: "opening" | "restock" | "adjust" | "sale";
  delta: number;
  balanceAfter: number;
  reason: string;
  actor: string;
  saleReference: string | null;
  createdAt: string;
};
export type StockHistory = { rows: StockMovement[]; nextCursor: string | null };
