import { sql } from "drizzle-orm";
import { db } from "@/db";
import { promotion, menuItem } from "@/db/schema";
import { AppError } from "@/lib/http";
import { lockedDevice } from "@/modules/attendance";
import { cashier } from "@/modules/sales";
import { promoRules, type Promo, type PromoRules } from "./rules";

export async function listPromos(): Promise<Promo[]> {
  const rows = await db
    .select()
    .from(promotion)
    .orderBy(promotion.createdAt, promotion.id);
  return rows.map((p) => ({
    ...promoRules.parse(p.rules),
    id: p.id,
    revision: p.revision,
  }));
}
export async function cashierPromos(token: string) {
  return db.transaction(async (tx) => {
    await cashier(tx, await lockedDevice(tx, token));
    const rows = await tx
      .select()
      .from(promotion)
      .orderBy(promotion.createdAt, promotion.id);
    return rows
      .map((p) => ({
        ...promoRules.parse(p.rules),
        id: p.id,
        revision: p.revision,
      }))
      .filter((p) => p.active);
  });
}
export async function savePromo(input: {
  id?: string;
  revision?: number;
  rules: PromoRules;
}) {
  const rules = promoRules.parse(input.rules);
  return db.transaction(async (tx) => {
    // Bounded catalog, serialized creation. Existing quotes never read mutable rules.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(891105)`);
    const rows = await tx.select({ id: menuItem.id }).from(menuItem);
    if (rules.productIds.some((id) => !rows.some((p) => p.id === id)))
      throw new AppError(400, "Menu promo tidak ditemukan.");
    let id: string;
    if (input.id) {
      const saved = await tx
        .update(promotion)
        .set({ rules, revision: sql`${promotion.revision}+1` })
        .where(
          sql`${promotion.id}=${input.id} AND ${promotion.revision}=${input.revision}`,
        )
        .returning();
      if (!saved[0])
        throw new AppError(
          409,
          "Promo berubah. Muat ulang daftar sebelum menyimpan.",
        );
      id = saved[0].id;
    } else {
      const count = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(promotion);
      if (count[0].n >= 100)
        throw new AppError(
          400,
          "Maksimal 100 promo. Ubah promo yang sudah ada.",
        );
      [{ id }] = await tx.insert(promotion).values({ rules }).returning();
    }
    await tx.execute(
      sql`INSERT INTO audit (actor,action,details) VALUES ('owner','promo.save',${JSON.stringify({ id })}::jsonb)`,
    );
    return { id };
  });
}
