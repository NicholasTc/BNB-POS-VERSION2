import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../src/db";
import {
  menuItem,
  sale,
  saleLine,
  saleDiscount,
  employee,
} from "../../src/db/schema";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { changeSale, prepareSale } from "../../src/modules/sales";
import { posState } from "../../src/modules/attendance";
import { report } from "../../src/modules/reporting";
import { businessToday } from "../../src/lib/dates";
import { saleRows } from "../../src/modules/sheets/rows";
import {
  savePromo,
  listPromos,
  cashierPromos,
} from "../../src/modules/promos/server";
import {
  pairDevice,
  saveEmployee,
  attendanceAction,
} from "../../src/modules/attendance";
import type { PromoRules } from "../../src/modules/promos/rules";
import { GET as cashierGET } from "../../src/app/api/promos/route";
import { POST as salePOST } from "../../src/app/api/sales/route";
import { syncSheets } from "../../src/modules/sheets/sync";
import { TEST_SPREADSHEET_ID } from "../../src/modules/sheets/config";
import type { MappedRow } from "../../src/modules/sheets/rows";
let productId: string, token: string;
const rules: PromoRules = {
  name: "Good day",
  percent: 20,
  scope: "all",
  productIds: [],
  minQuantity: 1,
  minDistinct: 1,
  minSpend: 0,
  maxDiscount: null,
  priority: 10,
  active: true,
};
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE promotion,employee,device,menu_item,throttle CASCADE",
  );
  productId = (
    await db
      .insert(menuItem)
      .values({ name: "Juice", price: 10000 })
      .returning()
  )[0].id;
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  token = await pairDevice();
});
afterAll(async () => {
  await pool.query("TRUNCATE promotion CASCADE");
  await pool.end();
});
async function promoInput() {
  await attendanceAction(token, "clock-in", "0123");
  await savePromo({ rules: { ...rules, percent: 10, priority: 1 } });
  await savePromo({
    rules: { ...rules, name: "Second", percent: 20, priority: 2 },
  });
  return {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "qris" as const,
    items: [{ id: productId, quantity: 10, unitPrice: 10000 }],
    promos: (await listPromos()).map((p) => ({
      id: p.id,
      revision: p.revision,
    })),
  };
}
it("atomically saves stacked discounts and retries the same quote after rule changes without repricing", async () => {
  const input = await promoInput();
  const [q] = await Promise.all([
    prepareSale(token, input),
    prepareSale(token, input),
  ]);
  expect(q.total).toBe(72000);
  expect(q.discountSnapshot?.discount).toBe(28000);
  const p = (await listPromos())[0];
  await savePromo({
    id: p.id,
    revision: p.revision,
    rules: { ...rules, name: "Edited", percent: 99, active: false },
  });
  expect((await prepareSale(token, input)).discountSnapshot).toEqual(
    q.discountSnapshot,
  );
  await changeSale(token, {
    id: q.id,
    action: "attest",
    paymentReceived: true,
  });
  const finished = await changeSale(token, { id: q.id, action: "complete" });
  expect(finished.total).toBe(72000);
  expect(finished.discountSnapshot).toEqual(q.discountSnapshot);
  expect(
    (await pool.query("SELECT count(*)::int n FROM sale_discount")).rows[0].n,
  ).toBe(1);
  await expect(prepareSale(token, { ...input, promos: [] })).rejects.toThrow(
    "Referensi",
  );
  const r = await report({
    from: businessToday(),
    to: businessToday(),
    salesPage: 1,
    attendancePage: 1,
  });
  expect(r.summary.revenue).toBe(72000);
  expect(r.items[0].total).toBe(72000);
  const exported: MappedRow[] = [];
  const synced = await syncSheets(
    pool,
    { mode: "test", spreadsheetId: TEST_SPREADSHEET_ID },
    async () => ({
      prepare: async () => {},
      write: async (rows) => {
        exported.push(...rows);
      },
    }),
  );
  expect(synced.state).toBe("synced");
  const row = exported.find((r) => r.tab === "Sales")!;
  expect(row.values[6]).toBe(72000);
  expect(row.values[9]).toContain("Good day (10%): -Rp10.000");
  expect(row.values[9]).toContain("Second (20%): -Rp18.000");
  expect(row.values[9]).not.toContain("Edited");
});
it("rejects stale, unknown, duplicate, inactive and ineligible selections with no partial sale", async () => {
  const input = await promoInput();
  await expect(
    prepareSale(token, {
      ...input,
      promos: [...input.promos, input.promos[0]],
    }),
  ).rejects.toThrow();
  await expect(
    prepareSale(token, {
      ...input,
      promos: [{ id: randomUUID(), revision: 1 }],
    }),
  ).rejects.toThrow("Promo berubah");
  const p = (await listPromos())[0];
  await savePromo({
    id: p.id,
    revision: 1,
    rules: { ...rules, minQuantity: 11 },
  });
  await expect(prepareSale(token, input)).rejects.toThrow("Promo berubah");
  await expect(
    prepareSale(token, { ...input, promos: [{ id: p.id, revision: 2 }] }),
  ).rejects.toThrow("Minimal 11");
  await savePromo({
    id: p.id,
    revision: 2,
    rules: { ...rules, active: false },
  });
  await expect(
    prepareSale(token, { ...input, promos: [{ id: p.id, revision: 3 }] }),
  ).rejects.toThrow("Promo berubah");
  expect((await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n).toBe(
    0,
  );
});
it("does not accept client-supplied amounts or rules, and keeps empty/no-promo recovery compatible", async () => {
  const input = await promoInput();
  const request = (payload: unknown) =>
    new Request("http://127.0.0.1:3100/api/sales", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3100",
        cookie: `lisi_device=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  expect(
    (await salePOST(request({ ...input, action: "prepare", discount: 99999 })))
      .status,
  ).toBe(400);
  expect(
    (
      await salePOST(
        request({
          ...input,
          action: "prepare",
          promos: [{ ...input.promos[0], percent: 99 }],
        }),
      )
    ).status,
  ).toBe(400);
  const noPromo = { ...input, promos: undefined };
  const q = await prepareSale(token, noPromo);
  expect(q.total).toBe(100000);
  expect(q.discountSnapshot).toBeNull();
  expect((await prepareSale(token, { ...noPromo, promos: [] })).id).toBe(q.id);
});
it("rolls back discount capture failure and owner edits cannot race into mixed rule snapshots", async () => {
  const input = await promoInput();
  await pool.query(
    "CREATE FUNCTION test_fail_discount() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test discount failure'; END $$; CREATE TRIGGER test_fail_discount BEFORE INSERT ON sale_discount FOR EACH ROW EXECUTE FUNCTION test_fail_discount()",
  );
  try {
    await expect(prepareSale(token, input)).rejects.toThrow();
    expect(
      (await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER test_fail_discount ON sale_discount; DROP FUNCTION test_fail_discount()",
    );
  }
  const p = (await listPromos())[0];
  const results = await Promise.allSettled([
    prepareSale(token, input),
    savePromo({
      id: p.id,
      revision: p.revision,
      rules: { ...rules, percent: 30 },
    }),
  ]);
  const prepared = results[0];
  if (prepared.status === "fulfilled") {
    expect(prepared.value.total).toBe(72000);
    expect(
      prepared.value.discountSnapshot?.applied.find((i) => i.id === p.id)
        ?.percent,
    ).toBe(10);
  } else {
    expect(String(prepared.reason)).toContain("Promo berubah");
    expect(
      (await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n,
    ).toBe(0);
  }
});
it("stores configurable rules and prevents concurrent owner changes from silently overwriting each other", async () => {
  const { id } = await savePromo({
    rules: {
      ...rules,
      scope: "selected",
      productIds: [productId],
      minQuantity: 3,
    },
  });
  const p = (await listPromos())[0];
  expect(p).toMatchObject({ id, revision: 1, minQuantity: 3 });
  const results = await Promise.allSettled([
    savePromo({ id, revision: 1, rules: { ...rules, name: "A" } }),
    savePromo({ id, revision: 1, rules: { ...rules, name: "B" } }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await listPromos())[0].revision).toBe(2);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int n FROM audit WHERE action='promo.save' AND details->>'id'=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(2);
});
it("rejects unknown products and invalid rules before writing", async () => {
  await expect(
    savePromo({
      rules: {
        ...rules,
        scope: "selected",
        productIds: ["00000000-0000-4000-8000-000000000001"],
      },
    }),
  ).rejects.toThrow();
  await expect(
    savePromo({ rules: { ...rules, percent: 100 } }),
  ).rejects.toThrow();
  expect(await listPromos()).toHaveLength(0);
});
it("only exposes active rules to a paired authenticated working cashier", async () => {
  await savePromo({ rules });
  await savePromo({ rules: { ...rules, name: "Off", active: false } });
  expect(
    (await cashierGET(new Request("http://127.0.0.1:3100/api/promos"))).status,
  ).toBe(401);
  await expect(cashierPromos(token)).rejects.toThrow();
  await attendanceAction(token, "clock-in", "0123");
  expect(await cashierPromos(token)).toHaveLength(1);
  await attendanceAction(token, "lock");
  await expect(cashierPromos(token)).rejects.toThrow();
});
it("enforces immutable quote-time discounts, net totals, report reconciliation and spreadsheet snapshots", async () => {
  await attendanceAction(token, "clock-in", "0123");
  const e = (await db.select().from(employee))[0],
    id = randomUUID();
  const snapshot = {
    grossTotal: 10000,
    discount: 2000,
    applied: [
      {
        id: randomUUID(),
        name: rules.name,
        percent: 20,
        revision: 1,
        discount: 2000,
        rules,
      },
    ],
    allocations: [{ id: productId, discount: 2000 }],
  };
  await db.transaction(async (tx) => {
    await tx.insert(sale).values({
      id,
      reference: id,
      deviceId: "shared",
      cashierId: e.id,
      cashierName: e.name,
      requestHash: id,
      paymentMethod: "cash",
      total: 8000,
    });
    await tx.insert(saleLine).values({
      saleId: id,
      menuItemId: productId,
      name: "Juice",
      unitPrice: 10000,
      quantity: 1,
      subtotal: 10000,
    });
    await tx.insert(saleDiscount).values({ saleId: id, snapshot });
  });
  await expect(
    db
      .update(saleDiscount)
      .set({ snapshot: { ...snapshot, discount: 1000 } })
      .where(eq(saleDiscount.saleId, id)),
  ).rejects.toThrow();
  await expect(
    db.delete(saleDiscount).where(eq(saleDiscount.saleId, id)),
  ).rejects.toThrow();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  const completed = await changeSale(token, { id, action: "complete" });
  const result = await report({
    from: businessToday(),
    to: businessToday(),
    salesPage: 1,
    attendancePage: 1,
  });
  expect(result.summary.revenue).toBe(8000);
  expect(result.items[0].total).toBe(8000);
  expect(result.history[0].discountSnapshot).toEqual(snapshot);
  const exported = saleRows(
    {
      id,
      reference: id,
      completed_at: completed.completedAt!,
      cashier_id: e.id,
      cashier_name: e.name,
      payment_method: "cash",
      total: 8000,
    },
    [
      {
        id: randomUUID(),
        menu_item_id: productId,
        name: "Juice",
        unit_price: 10000,
        quantity: 1,
        subtotal: 10000,
      },
    ],
    1,
    snapshot,
  )[0].values;
  expect(exported[6]).toBe(8000);
  expect(exported[9]).toContain("Good day (20%): -Rp2.000");
  const second = await prepareSale(token, {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: productId, unitPrice: 10000, quantity: 1 }],
  });
  await expect(
    db.insert(saleDiscount).values({
      saleId: second.id,
      snapshot: {
        ...snapshot,
        discount: 0,
        applied: [{ ...snapshot.applied[0], discount: 0 }],
        allocations: [{ id: productId, discount: 0 }],
      },
    }),
  ).rejects.toThrow();
});
