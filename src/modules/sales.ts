import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, employee, menuItem, sale, saleLine } from "@/db/schema";
import { AppError } from "@/lib/http";
import { digest } from "@/lib/credentials";
import { priceLines } from "@/lib/money";
import { cashierValid, lockedDevice, type Transaction } from "./attendance";
export type PrepareSale = {
  id: string;
  generation: number;
  paymentMethod: "cash" | "qris";
  items: { id: string; quantity: number; unitPrice: number }[];
};
export async function openSale(tx: Transaction) {
  const [s] = await tx
    .select()
    .from(sale)
    .where(inArray(sale.status, ["pending", "paid"]));
  return s ?? null;
}
async function cashier(
  tx: Transaction,
  d: Awaited<ReturnType<typeof lockedDevice>>,
) {
  if (!cashierValid(d))
    throw new AppError(
      401,
      "Kasir terkunci. Masukkan PIN Anda untuk melanjutkan.",
    );
  const [e] = await tx
    .select()
    .from(employee)
    .where(eq(employee.id, d.cashierId!));
  const shift = await tx.execute(
    sql`SELECT id FROM ${attendance} WHERE employee_id=${d.cashierId} AND clock_out IS NULL`,
  );
  if (!e?.active || !shift.rowCount)
    throw new AppError(401, "Kasir tidak aktif. Masukkan PIN kembali.");
  return e;
}
export async function saleDetails(tx: Transaction, id: string) {
  const [s] = await tx.select().from(sale).where(eq(sale.id, id));
  if (!s) throw new AppError(404, "Transaksi belum ditemukan.");
  const lines = await tx
    .select({
      id: saleLine.menuItemId,
      name: saleLine.name,
      unitPrice: saleLine.unitPrice,
      quantity: saleLine.quantity,
      subtotal: saleLine.subtotal,
    })
    .from(saleLine)
    .where(eq(saleLine.saleId, id));
  return { ...s, lines };
}
export async function prepareSale(token: string, input: PrepareSale) {
  const sorted = [...input.items].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(sorted.map((i) => i.id)).size !== sorted.length)
    throw new AppError(400, "Menu yang sama tidak boleh diulang.");
  const requestHash = digest(
    JSON.stringify({
      generation: input.generation,
      paymentMethod: input.paymentMethod,
      items: sorted,
    }),
  );
  return db.transaction(async (tx) => {
    const d = await lockedDevice(tx, token);
    const [existing] = await tx
      .select()
      .from(sale)
      .where(eq(sale.id, input.id));
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new AppError(
          409,
          "Referensi sudah digunakan untuk pesanan berbeda.",
        );
      return saleDetails(tx, existing.id);
    }
    const e = await cashier(tx, d);
    if (d.generation !== input.generation)
      throw new AppError(
        409,
        "Kasir berubah. Periksa pesanan sebelum melanjutkan.",
      );
    if (await openSale(tx))
      throw new AppError(
        409,
        "Selesaikan atau periksa transaksi sebelumnya terlebih dahulu.",
      );
    // Share locks prevent an owner edit between price validation and snapshots.
    const products = await tx
      .select()
      .from(menuItem)
      .where(
        inArray(
          menuItem.id,
          sorted.map((i) => i.id),
        ),
      )
      .for("share");
    const lines = sorted.map((i) => {
      const p = products.find((p) => p.id === i.id);
      if (!p?.active || p.price !== i.unitPrice)
        throw new AppError(
          409,
          "Menu atau harga berubah. Perbarui pesanan sebelum menerima pembayaran.",
        );
      return {
        saleId: input.id,
        menuItemId: p.id,
        name: p.name,
        unitPrice: p.price,
        quantity: i.quantity,
        subtotal: p.price * i.quantity,
      };
    });
    let total: number;
    try {
      total = priceLines(lines);
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
    await tx
      .insert(sale)
      .values({
        id: input.id,
        reference: "LS-" + input.id.toUpperCase(),
        deviceId: "shared",
        cashierId: e.id,
        cashierName: e.name,
        requestHash,
        paymentMethod: input.paymentMethod,
        total,
      });
    await tx.insert(saleLine).values(lines);
    return saleDetails(tx, input.id);
  });
}
export async function getSale(token: string, id?: string) {
  return db.transaction(async (tx) => {
    await lockedDevice(tx, token);
    const target = id ?? (await openSale(tx))?.id;
    return target ? await saleDetails(tx, target) : null;
  });
}
export async function changeSale(
  token: string,
  input: {
    id: string;
    action: "attest" | "complete" | "cancel";
    paymentReceived?: true;
    paymentNotReceived?: true;
  },
) {
  return db.transaction(async (tx) => {
    const d = await lockedDevice(tx, token);
    const [s] = await tx
      .select()
      .from(sale)
      .where(eq(sale.id, input.id))
      .for("update");
    if (!s)
      throw new AppError(404, "Transaksi belum ditemukan. Periksa kembali.");
    // A lost completion response can be recovered after cashier expiry/clock-out.
    if (s.status === "completed" && input.action !== "cancel")
      return saleDetails(tx, s.id);
    const e = await cashier(tx, d);
    if (e.id !== s.cashierId)
      throw new AppError(
        403,
        `Masukkan PIN ${s.cashierName} untuk menyelesaikan transaksi ini.`,
      );
    if (input.action === "cancel") {
      if (s.status !== "pending" || input.paymentNotReceived !== true)
        throw new AppError(
          409,
          "Pembayaran sudah dicatat atau belum dipastikan. Transaksi tidak dapat dibatalkan.",
        );
      await tx
        .update(sale)
        .set({ status: "cancelled" })
        .where(eq(sale.id, s.id));
    } else if (input.action === "attest") {
      if (input.paymentReceived !== true)
        throw new AppError(400, "Pastikan pembayaran telah diterima.");
      if (s.status === "pending")
        await tx
          .update(sale)
          .set({ status: "paid", attestedAt: new Date() })
          .where(eq(sale.id, s.id));
      else if (s.status !== "paid")
        throw new AppError(409, "Transaksi sudah dibatalkan.");
    } else {
      if (s.status !== "paid")
        throw new AppError(409, "Catat penerimaan pembayaran terlebih dahulu.");
      await tx
        .update(sale)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(sale.id, s.id));
    }
    return saleDetails(tx, s.id);
  });
}
export async function saveMenu(input: {
  id?: string;
  name: string;
  price: number;
  active: boolean;
}) {
  await db.transaction(async (tx) => {
    if (input.id) {
      const result = await tx
        .update(menuItem)
        .set({ name: input.name, price: input.price, active: input.active })
        .where(eq(menuItem.id, input.id))
        .returning({ id: menuItem.id });
      if (!result.length) throw new AppError(404, "Menu tidak ditemukan.");
    } else await tx.insert(menuItem).values(input);
    await tx.execute(
      sql`INSERT INTO audit (actor,action,details) VALUES ('owner',${input.id ? "menu.update" : "menu.create"},${JSON.stringify({ menuItemId: input.id ?? null })}::jsonb)`,
    );
  });
}
