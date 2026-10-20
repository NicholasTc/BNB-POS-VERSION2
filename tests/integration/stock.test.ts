import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import { db, pool } from "../../src/db";
import {
  menuItem,
  stockItem,
  stockMovement,
  stockUsage,
} from "../../src/db/schema";
import {
  runStockCommand,
  stockItems,
  getStockRecipe,
  stockHistory,
  stockReceipt,
} from "../../src/modules/stock/server";
import {
  pairDevice,
  saveEmployee,
  attendanceAction,
  posState,
} from "../../src/modules/attendance";
import {
  prepareSale,
  changeSale,
  type PrepareSale,
} from "../../src/modules/sales";
import { eq } from "drizzle-orm";
let token: string, product: string, input: PrepareSale;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE stock_item,stock_operation,employee,device,menu_item,throttle CASCADE",
  );
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  product = (
    await db
      .insert(menuItem)
      .values({ name: "Mango smoothie", price: 20000 })
      .returning()
  )[0].id;
  input = {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: product, unitPrice: 20000, quantity: 2 }],
  };
});
afterAll(async () => {
  await pool.query("TRUNCATE stock_item,stock_operation CASCADE");
  await pool.end();
});
async function item(name = "Cup", openingQuantity = 10) {
  const r = await runStockCommand({
    id: randomUUID(),
    action: "create",
    name,
    unit: "pcs",
    openingQuantity,
    lowThreshold: 3,
  });
  return (await stockItems()).items.find((i) => i.id === r.stockItemId)!;
}
async function recipe(lines: { stockItemId: string; quantity: number }[]) {
  const r = await getStockRecipe(product);
  return runStockCommand({
    id: randomUUID(),
    action: "recipe",
    menuItemId: product,
    revision: r.revision,
    lines,
  });
}
async function complete() {
  await changeSale(token, {
    id: input.id,
    action: "attest",
    paymentReceived: true,
  });
  return changeSale(token, { id: input.id, action: "complete" });
}
it("deducts shared supplies once only at completed payment, retains history and handles parallel retries", async () => {
  const cup = await item(),
    fruit = await item("Mango pack", 4);
  await recipe([
    { stockItemId: cup.id, quantity: 1 },
    { stockItemId: fruit.id, quantity: 1 },
  ]);
  await prepareSale(token, input);
  expect((await stockItems()).items.find((i) => i.id === cup.id)?.balance).toBe(
    10,
  );
  await changeSale(token, {
    id: input.id,
    action: "attest",
    paymentReceived: true,
  });
  expect((await stockItems()).items.find((i) => i.id === cup.id)?.balance).toBe(
    10,
  );
  await Promise.all(
    Array.from({ length: 6 }, () =>
      changeSale(token, { id: input.id, action: "complete" }),
    ),
  );
  const data = await stockItems();
  expect(data.items.find((i) => i.id === cup.id)?.balance).toBe(8);
  expect(data.items.find((i) => i.id === fruit.id)?.balance).toBe(2);
  expect(data.lowCount).toBe(1);
  const movements = (await stockHistory()).rows.filter(
    (m) => m.kind === "sale",
  );
  expect(movements).toHaveLength(2);
  expect(movements[0]).toMatchObject({
    delta: -2,
    actor: "Ayu",
    saleReference: "LS-" + input.id.toUpperCase(),
  });
});
it("freezes quote usage before recipe edits; cancellation and historic/no-recipe sales consume nothing", async () => {
  const cup = await item();
  await recipe([{ stockItemId: cup.id, quantity: 1 }]);
  await prepareSale(token, input);
  await recipe([{ stockItemId: cup.id, quantity: 3 }]);
  await complete();
  expect((await stockItems()).items[0].balance).toBe(8);
  input = { ...input, id: randomUUID() };
  await prepareSale(token, input);
  await changeSale(token, {
    id: input.id,
    action: "cancel",
    paymentNotReceived: true,
  });
  expect((await stockItems()).items[0].balance).toBe(8);
  await recipe([]);
  input = { ...input, id: randomUUID() };
  await prepareSale(token, input);
  await recipe([{ stockItemId: cup.id, quantity: 9 }]);
  await complete();
  expect((await stockItems()).items[0].balance).toBe(8);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int n FROM stock_movement WHERE kind='sale'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("permits negative stock without blocking a paid sale and preserves original recipe snapshots", async () => {
  const cup = await item("Cup", 1);
  await recipe([{ stockItemId: cup.id, quantity: 2 }]);
  await prepareSale(token, input);
  await complete();
  expect((await stockItems()).items[0].balance).toBe(-3);
  expect((await stockItems()).negativeCount).toBe(1);
  await expect(db.update(stockUsage).set({ quantity: 1 })).rejects.toThrow();
  await expect(
    db.delete(stockMovement).where(eq(stockMovement.kind, "sale")),
  ).rejects.toThrow();
  await expect(
    db.update(stockItem).set({ balance: 999, revision: 3 }),
  ).rejects.toThrow();
});
it("is idempotent for owner restocks and fences an abandoned delayed request", async () => {
  const cup = await item(),
    id = randomUUID();
  const request = {
    id,
    action: "restock" as const,
    stockItemId: cup.id,
    quantity: 50,
    reason: "Delivery",
  };
  await Promise.all([runStockCommand(request), runStockCommand(request)]);
  expect((await stockItems()).items[0].balance).toBe(60);
  expect(await stockReceipt(id)).toMatchObject({ action: "restock" });
  await expect(runStockCommand({ ...request, quantity: 51 })).rejects.toThrow();
  const abandoned = randomUUID();
  await runStockCommand({ id: abandoned, action: "abandon" });
  await expect(
    runStockCommand({ ...request, id: abandoned }),
  ).rejects.toThrow();
  expect((await runStockCommand({ id, action: "abandon" })).action).toBe(
    "restock",
  );
  expect((await stockItems()).items[0].balance).toBe(60);
});
it("rejects stale physical counts and recipe edits rather than overwriting an intervening sale", async () => {
  const cup = await item();
  await recipe([{ stockItemId: cup.id, quantity: 1 }]);
  await prepareSale(token, input);
  await complete();
  await expect(
    runStockCommand({
      id: randomUUID(),
      action: "adjust",
      stockItemId: cup.id,
      revision: cup.revision,
      quantity: 7,
      reason: "Physical count",
    }),
  ).rejects.toThrow("Stok berubah");
  const current = (await stockItems()).items[0];
  await runStockCommand({
    id: randomUUID(),
    action: "adjust",
    stockItemId: cup.id,
    revision: current.revision,
    quantity: 7,
    reason: "Spoiled",
  });
  expect((await stockItems()).items[0].balance).toBe(7);
  await expect(
    runStockCommand({
      id: randomUUID(),
      action: "recipe",
      menuItemId: product,
      revision: 0,
      lines: [],
    }),
  ).rejects.toThrow("Pemakaian menu berubah");
});
it("rolls back the entire completion if usage capture fails and safely completes the same paid sale later", async () => {
  const cup = await item();
  await recipe([{ stockItemId: cup.id, quantity: 1 }]);
  await prepareSale(token, input);
  await changeSale(token, {
    id: input.id,
    action: "attest",
    paymentReceived: true,
  });
  await pool.query(
    "CREATE FUNCTION test_stock_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='sale' THEN RAISE EXCEPTION 'test stock failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_stock_fail BEFORE INSERT ON stock_movement FOR EACH ROW EXECUTE FUNCTION test_stock_fail()",
  );
  try {
    await expect(
      changeSale(token, { id: input.id, action: "complete" }),
    ).rejects.toThrow();
    expect((await stockItems()).items[0].balance).toBe(10);
    expect(
      (await pool.query("SELECT status FROM sale WHERE id=$1", [input.id]))
        .rows[0].status,
    ).toBe("paid");
  } finally {
    await pool.query(
      "DROP TRIGGER test_stock_fail ON stock_movement; DROP FUNCTION test_stock_fail()",
    );
  }
  await complete();
  expect((await stockItems()).items[0].balance).toBe(8);
});
it("aggregates shared ingredients across products while concurrent restocks and completion reconcile", async () => {
  const cup = await item();
  await recipe([{ stockItemId: cup.id, quantity: 1 }]);
  const [other] = await db
    .insert(menuItem)
    .values({ name: "Egg dish", price: 15000 })
    .returning();
  await runStockCommand({
    id: randomUUID(),
    action: "recipe",
    menuItemId: other.id,
    revision: 0,
    lines: [{ stockItemId: cup.id, quantity: 2 }],
  });
  input.items.push({ id: other.id, unitPrice: 15000, quantity: 3 });
  await prepareSale(token, input);
  await Promise.all([
    complete(),
    runStockCommand({
      id: randomUUID(),
      action: "restock",
      stockItemId: cup.id,
      quantity: 7,
      reason: "Delivery",
    }),
  ]);
  expect((await stockItems()).items[0].balance).toBe(9);
  const history = await stockHistory(cup.id);
  expect(history.rows.filter((m) => m.kind === "sale")).toMatchObject([
    { delta: -8 },
  ]);
  expect(history.rows.reduce((n, m) => n + m.delta, 0)).toBe(9);
});
it("paginates history without skips or repeats and rejects a cursor belonging to another item", async () => {
  const cup = await item(),
    other = await item("Eggs");
  for (let n = 0; n < 29; n++)
    await runStockCommand({
      id: randomUUID(),
      action: "restock",
      stockItemId: cup.id,
      quantity: 1,
      reason: "Delivery",
    });
  const first = await stockHistory(cup.id),
    second = await stockHistory(cup.id, first.nextCursor!);
  expect(first.rows).toHaveLength(25);
  expect(second.rows).toHaveLength(5);
  expect(new Set([...first.rows, ...second.rows].map((m) => m.id)).size).toBe(
    30,
  );
  expect(second.nextCursor).toBeNull();
  await expect(stockHistory(other.id, first.nextCursor!)).rejects.toThrow(
    "Halaman riwayat berubah",
  );
});
