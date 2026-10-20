import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  stockItem,
  stockRecipe,
  stockRecipeLine,
  stockMovement,
  stockOperation,
  menuItem,
  audit,
} from "@/db/schema";
import { digest } from "@/lib/credentials";
import { AppError } from "@/lib/http";
import {
  stockCommand,
  type StockCommand,
  type StockResult,
  type StockData,
  type StockHistory,
} from "./types";

const lock = sql`SELECT pg_advisory_xact_lock(891107)`;
export async function stockItems(): Promise<StockData> {
  const items = await db
    .select()
    .from(stockItem)
    .orderBy(stockItem.name, stockItem.id);
  return {
    items: items.map((i) => ({ ...i, unit: i.unit as "pcs" | "pack" })),
    lowCount: items.filter((i) => i.balance <= i.lowThreshold).length,
    negativeCount: items.filter((i) => i.balance < 0).length,
  };
}
export async function getStockRecipe(menuItemId: string) {
  return db.transaction(
    async (tx) => {
      if (
        !(
          await tx
            .select({ id: menuItem.id })
            .from(menuItem)
            .where(eq(menuItem.id, menuItemId))
        ).length
      )
        throw new AppError(404, "Menu tidak ditemukan.");
      const [recipe] = await tx
        .select()
        .from(stockRecipe)
        .where(eq(stockRecipe.menuItemId, menuItemId));
      const lines = await tx
        .select({
          stockItemId: stockRecipeLine.stockItemId,
          quantity: stockRecipeLine.quantity,
        })
        .from(stockRecipeLine)
        .where(eq(stockRecipeLine.menuItemId, menuItemId))
        .orderBy(stockRecipeLine.stockItemId);
      return { menuItemId, revision: recipe?.revision ?? 0, lines };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function stockReceipt(id: string) {
  return db.transaction(async (tx) => {
    await tx.execute(lock);
    const [op] = await tx
      .select()
      .from(stockOperation)
      .where(eq(stockOperation.id, id));
    return op?.result ?? null;
  });
}
export async function stockHistory(
  stockItemId?: string,
  cursor?: string,
): Promise<StockHistory> {
  return db.transaction(
    async (tx) => {
      if (cursor) {
        const [anchor] = await tx
          .select()
          .from(stockMovement)
          .where(eq(stockMovement.id, cursor));
        if (!anchor || (stockItemId && anchor.stockItemId !== stockItemId))
          throw new AppError(
            400,
            "Halaman riwayat berubah. Buka halaman pertama.",
          );
      }
      const rows = await tx.execute<
        Omit<StockHistory["rows"][number], "createdAt"> & { createdAt: string }
      >(sql`
      SELECT id,stock_item_id AS "stockItemId",name,unit,kind,delta::float8 AS delta,balance_after::float8 AS "balanceAfter",reason,actor,sale_reference AS "saleReference",created_at AS "createdAt"
      FROM stock_movement WHERE true ${stockItemId ? sql`AND stock_item_id=${stockItemId}::uuid` : sql``}
      ${cursor ? sql`AND (created_at,id)<(SELECT created_at,id FROM stock_movement WHERE id=${cursor}::uuid)` : sql``}
      ORDER BY created_at DESC,id DESC LIMIT 26`);
      return {
        rows: rows.rows
          .slice(0, 25)
          .map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt).toISOString(),
          })),
        nextCursor: rows.rows.length > 25 ? rows.rows[24].id : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function runStockCommand(raw: StockCommand): Promise<StockResult> {
  const input = stockCommand.parse(raw);
  if (input.action === "recipe")
    input.lines.sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));
  const requestHash = digest(JSON.stringify(input));
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(lock);
      const [existing] = await tx
        .select()
        .from(stockOperation)
        .where(eq(stockOperation.id, input.id));
      if (input.action === "abandon") {
        if (existing) return existing.result;
        const result: StockResult = { id: input.id, action: "abandon" };
        await tx
          .insert(stockOperation)
          .values({ id: input.id, requestHash: "abandoned", result });
        return result;
      }
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new AppError(
            409,
            "Percobaan stok ini sudah dipakai. Periksa status sebelum mencoba lagi.",
          );
        return existing.result;
      }
      const result: StockResult = { id: input.id, action: input.action };
      if (input.action === "recipe") result.menuItemId = input.menuItemId;
      else
        result.stockItemId =
          input.action === "create" ? randomUUID() : input.stockItemId;
      await tx
        .insert(stockOperation)
        .values({ id: input.id, requestHash, result });
      if (input.action === "create") {
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(stockItem);
        if (count.n >= 500)
          throw new AppError(400, "Maksimal 500 barang stok.");
        await tx
          .insert(stockItem)
          .values({
            id: result.stockItemId,
            name: input.name,
            unit: input.unit,
            lowThreshold: input.lowThreshold,
          });
        await tx
          .insert(stockMovement)
          .values({
            stockItemId: result.stockItemId!,
            name: input.name,
            unit: input.unit,
            kind: "opening",
            delta: input.openingQuantity,
            balanceAfter: 0,
            reason: "",
            actor: "owner",
            operationId: input.id,
          });
      } else if (input.action === "recipe") {
        const [product] = await tx
          .select({ id: menuItem.id })
          .from(menuItem)
          .where(eq(menuItem.id, input.menuItemId));
        if (!product) throw new AppError(404, "Menu tidak ditemukan.");
        const [recipe] = await tx
          .select()
          .from(stockRecipe)
          .where(eq(stockRecipe.menuItemId, input.menuItemId));
        if ((recipe?.revision ?? 0) !== input.revision)
          throw new AppError(
            409,
            "Pemakaian menu berubah. Muat ulang sebelum menyimpan.",
          );
        const ids = input.lines.map((l) => l.stockItemId);
        if (
          ids.length &&
          (await tx.select().from(stockItem).where(inArray(stockItem.id, ids)))
            .length !== ids.length
        )
          throw new AppError(400, "Barang stok tidak ditemukan.");
        if (recipe)
          await tx
            .update(stockRecipe)
            .set({ revision: recipe.revision + 1 })
            .where(eq(stockRecipe.menuItemId, input.menuItemId));
        else
          await tx
            .insert(stockRecipe)
            .values({ menuItemId: input.menuItemId, revision: 1 });
        await tx
          .delete(stockRecipeLine)
          .where(eq(stockRecipeLine.menuItemId, input.menuItemId));
        if (input.lines.length)
          await tx
            .insert(stockRecipeLine)
            .values(
              input.lines.map((l) => ({ ...l, menuItemId: input.menuItemId })),
            );
      } else {
        const [item] = await tx
          .select()
          .from(stockItem)
          .where(eq(stockItem.id, input.stockItemId))
          .for("update");
        if (!item) throw new AppError(404, "Barang stok tidak ditemukan.");
        if (input.action !== "restock" && item.revision !== input.revision)
          throw new AppError(
            409,
            "Stok berubah. Periksa jumlah terbaru sebelum menyimpan.",
          );
        if (input.action === "edit")
          await tx
            .update(stockItem)
            .set({
              name: input.name,
              lowThreshold: input.lowThreshold,
              revision: item.revision + 1,
            })
            .where(eq(stockItem.id, item.id));
        else
          await tx
            .insert(stockMovement)
            .values({
              stockItemId: item.id,
              name: item.name,
              unit: item.unit,
              kind: input.action,
              delta:
                input.action === "restock"
                  ? input.quantity
                  : input.quantity - item.balance,
              balanceAfter: 0,
              reason: input.reason,
              actor: "owner",
              operationId: input.id,
            });
      }
      await tx
        .insert(audit)
        .values({
          actor: "owner",
          action: `stock.${input.action}`,
          details: {
            operationId: input.id,
            stockItemId: result.stockItemId ?? null,
            menuItemId: result.menuItemId ?? null,
          },
        });
      return result;
    });
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    if (
      (e.cause?.code ?? e.code) === "23505" &&
      (e.cause?.constraint ?? e.constraint) === "stock_item_name_unique"
    )
      throw new AppError(409, "Nama barang sudah digunakan. Pilih nama lain.");
    throw error;
  }
}
