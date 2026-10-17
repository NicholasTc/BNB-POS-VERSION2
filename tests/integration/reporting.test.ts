import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db";
import {
  employee,
  menuItem,
  device,
  sale,
  saleLine,
  attendance,
} from "../../src/db/schema";
import { report } from "../../src/modules/reporting";
import type { Transaction } from "../../src/modules/attendance";
import { GET } from "../../src/app/api/owner/report/route";
let ayu: string, bima: string, coffee: string, pastry: string;
const filter = {
  from: "2026-10-17",
  to: "2026-10-17",
  salesPage: 1,
  attendancePage: 1,
};
async function seed(
  tx: Transaction,
  cashierId: string,
  itemId: string,
  price: number,
  qty: number,
  time: string,
  payment: "cash" | "qris",
  status: "paid" | "completed" = "completed",
) {
  const id = randomUUID();
  await tx
    .insert(sale)
    .values({
      id,
      reference: "LS-" + id,
      deviceId: "shared",
      cashierId,
      cashierName: cashierId === ayu ? "Ayu" : "Bima",
      requestHash: id,
      paymentMethod: payment,
      total: price * qty,
    });
  await tx
    .insert(saleLine)
    .values({
      saleId: id,
      menuItemId: itemId,
      name: itemId === coffee ? "Kopi susu" : "Croissant",
      unitPrice: price,
      quantity: qty,
      subtotal: price * qty,
    });
  await tx
    .update(sale)
    .set({ status: "paid", attestedAt: new Date(time) })
    .where(eq(sale.id, id));
  if (status === "completed")
    await tx
      .update(sale)
      .set({ status: "completed", completedAt: new Date(time) })
      .where(eq(sale.id, id));
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query("TRUNCATE employee,device,menu_item CASCADE");
  const es = await db
    .insert(employee)
    .values([
      { name: "Ayu", pinHash: "fixture", pinLookup: "ayu" },
      { name: "Bima", pinHash: "fixture", pinLookup: "bima" },
    ])
    .returning();
  ayu = es[0].id;
  bima = es[1].id;
  const ms = await db
    .insert(menuItem)
    .values([
      { name: "Kopi susu", price: 18000 },
      { name: "Croissant", price: 22000 },
    ])
    .returning();
  coffee = ms[0].id;
  pastry = ms[1].id;
  await db
    .insert(device)
    .values({ expiresAt: new Date(Date.now() + 86400000) });
  await db.transaction(async (tx) => {
    await seed(tx, ayu, coffee, 18000, 1, "2026-10-16T16:59:59.999Z", "cash");
    await seed(tx, ayu, coffee, 18000, 2, "2026-10-16T17:00:00Z", "cash");
    await seed(tx, bima, pastry, 22000, 1, "2026-10-17T16:59:59.999Z", "qris");
    await seed(tx, bima, coffee, 15000, 1, "2026-10-17T17:00:00Z", "qris");
    await seed(
      tx,
      ayu,
      coffee,
      18000,
      1,
      "2026-10-17T12:00:00Z",
      "cash",
      "paid",
    );
  });
  await db.insert(attendance).values([
    {
      employeeId: ayu,
      clockIn: new Date("2026-10-16T12:00:00Z"),
      clockOut: new Date("2026-10-16T18:00:00Z"),
    },
    {
      employeeId: bima,
      clockIn: new Date("2026-10-16T10:00:00Z"),
      clockOut: new Date("2026-10-16T17:00:00Z"),
    },
    { employeeId: bima, clockIn: new Date("2026-10-17T16:00:00Z") },
    {
      employeeId: ayu,
      clockIn: new Date("2026-10-17T17:00:00Z"),
      clockOut: new Date("2026-10-17T18:00:00Z"),
    },
  ]);
});
afterAll(async () => {
  await pool.end();
});
describe("owner reporting against known fixtures", () => {
  it("reconciles revenue/count/payment/item/cashier/history at Jakarta midnight", async () => {
    const r = await report(filter);
    expect(r.summary).toEqual({ revenue: 58000, salesCount: 2 });
    expect(r.payments.find((p) => p.method === "cash")?.total).toBe(36000);
    expect(r.payments.find((p) => p.method === "qris")?.total).toBe(22000);
    expect(r.items.find((i) => i.id === coffee)?.quantity).toBe(2);
    expect(r.cashiers.find((c) => c.id === ayu)?.total).toBe(36000);
    for (const amounts of [r.payments, r.items, r.cashiers, r.history])
      expect(amounts.reduce((n, p) => n + p.total, 0)).toBe(r.summary.revenue);
    expect(
      r.history.flatMap((s) => s.lines).reduce((n, l) => n + l.subtotal, 0),
    ).toBe(r.summary.revenue);
    expect(r.open).toHaveLength(1);
    expect(r.open[0].status).toBe("paid");
  });
  it("includes overnight/open attendance and excludes exact non-overlapping boundaries", async () => {
    const r = await report(filter);
    expect(r.attendanceCount).toBe(2);
    expect(r.attendance).toHaveLength(2);
    expect(r.attendance.some((a) => a.clockOut === null)).toBe(true);
  });
  it("does not silently truncate paginated history or change summary with pages", async () => {
    await db
      .update(sale)
      .set({
        status: "completed",
        completedAt: new Date("2026-10-17T12:00:00Z"),
      })
      .where(eq(sale.status, "paid"));
    await db.transaction(async (tx) => {
      for (let i = 0; i < 26; i++)
        await seed(tx, ayu, coffee, 1000, 1, "2026-10-17T10:00:00Z", "cash");
    });
    const first = await report(filter),
      second = await report({ ...filter, salesPage: 2 });
    expect(first.history).toHaveLength(25);
    expect(second.history).toHaveLength(4);
    expect(first.summary).toEqual({ revenue: 102000, salesCount: 29 });
    expect(second.summary).toEqual(first.summary);
    expect(
      new Set([...first.history, ...second.history].map((s) => s.id)).size,
    ).toBe(29);
  });
  it("handles empty filters and rejects invalid dates", async () => {
    expect(
      (await report({ ...filter, from: "2025-01-01", to: "2025-01-01" }))
        .summary,
    ).toEqual({ revenue: 0, salesCount: 0 });
    await expect(report({ ...filter, from: "2026-02-30" })).rejects.toThrow(
      "valid",
    );
  });
  it("denies unauthenticated report access", async () =>
    expect(
      (await GET(new Request("http://127.0.0.1:3100/api/owner/report"))).status,
    ).toBe(401));
});
