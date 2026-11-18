import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import { db, pool } from "../../src/db";
import { menuItem, user } from "../../src/db/schema";
import { ownerAlerts } from "../../src/modules/alerts/server";
import { runStockCommand } from "../../src/modules/stock/server";
import {
  pairDevice,
  saveEmployee,
  attendanceAction,
  posState,
} from "../../src/modules/attendance";
import { prepareSale, changeSale } from "../../src/modules/sales";
import { TEST_SPREADSHEET_ID } from "../../src/modules/sheets/config";
import type { AlertFeed, AlertKey } from "../../src/modules/alerts/types";
const target = (feed: AlertFeed, key: AlertKey) => {
  const a = feed.items.find((a) => a.key === key)!;
  return { key: a.key, version: a.version };
};
let product: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE owner_user,stock_item,stock_operation,menu_item,employee,device,throttle,sheets_sync_target CASCADE",
  );
  await db
    .insert(user)
    .values({ id: "owner", name: "Owner", email: "owner@test.local" });
  product = (
    await db
      .insert(menuItem)
      .values({ name: "Smoothie", price: 20000 })
      .returning()
  )[0].id;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await pool.query("TRUNCATE owner_user,stock_item,stock_operation CASCADE");
  await pool.end();
});
async function quote() {
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  const token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  const id = randomUUID();
  await prepareSale(token, {
    id,
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: product, unitPrice: 20000, quantity: 1 }],
  });
  return { token, id };
}
it("persists one grouped reminder, rejects concurrent stale clears and makes repeated reads write-free when unchanged", async () => {
  await db.insert(menuItem).values({ name: "Food", price: 15000 });
  const first = await ownerAlerts("owner");
  expect(first.items).toHaveLength(1);
  expect(first.items[0].count).toBe(2);
  const before = (await pool.query("SELECT xmin::text FROM owner_alert_state"))
    .rows;
  await ownerAlerts("owner");
  expect(
    (await pool.query("SELECT xmin::text FROM owner_alert_state")).rows,
  ).toEqual(before);
  const replies = await Promise.allSettled([
    ownerAlerts("owner", {
      action: "clear",
      targets: [target(first, "categories")],
    }),
    ownerAlerts("owner", {
      action: "clear",
      targets: [target(first, "categories")],
    }),
  ]);
  expect(replies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const after = await ownerAlerts("owner");
  expect(after.visibleCount).toBe(0);
  expect(after.items[0].hidden).toBe(true);
  expect(
    (await pool.query("SELECT count(*)::int n FROM owner_alert_state")).rows[0]
      .n,
  ).toBe(1);
});
it("auto-resolves and reopens a recurrence or changed group without inheriting dismissal", async () => {
  let feed = await ownerAlerts("owner");
  await ownerAlerts("owner", {
    action: "dismiss",
    targets: [target(feed, "categories")],
  });
  await pool.query("UPDATE menu_item SET category='drink'");
  expect((await ownerAlerts("owner")).items).toEqual([]);
  await pool.query("UPDATE menu_item SET category='uncategorized'");
  feed = await ownerAlerts("owner");
  expect(feed.items[0]).toMatchObject({ hidden: false, disposition: "none" });
  await ownerAlerts("owner", {
    action: "dismiss",
    targets: [target(feed, "categories")],
  });
  await db.insert(menuItem).values({ name: "New product", price: 12000 });
  expect((await ownerAlerts("owner")).visibleCount).toBe(1);
});
it("persists snooze, permits restore, and resurfaces at expiry", async () => {
  await runStockCommand({
    id: randomUUID(),
    action: "create",
    name: "Cups",
    unit: "pcs",
    openingQuantity: 2,
    lowThreshold: 3,
  });
  let feed = await ownerAlerts("owner");
  feed = await ownerAlerts("owner", {
    action: "snooze",
    targets: [target(feed, "stock-low")],
  });
  expect(feed.items.find((a) => a.key === "stock-low")?.hidden).toBe(true);
  feed = await ownerAlerts("owner", {
    action: "restore",
    targets: [target(feed, "stock-low")],
  });
  expect(feed.items.find((a) => a.key === "stock-low")?.hidden).toBe(false);
  feed = await ownerAlerts("owner", {
    action: "snooze",
    targets: [target(feed, "stock-low")],
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 3601000);
  feed = await ownerAlerts("owner");
  expect(feed.items.find((a) => a.key === "stock-low")).toMatchObject({
    hidden: false,
    disposition: "none",
    snoozedUntil: null,
  });
});
it("rejects stale group changes and all-or-nothing clearing of urgent issues", async () => {
  const old = await ownerAlerts("owner");
  await db.insert(menuItem).values({ name: "Second", price: 10000 });
  await expect(
    ownerAlerts("owner", {
      action: "clear",
      targets: [target(old, "categories")],
    }),
  ).rejects.toThrow("Peringatan berubah");
  const { token, id } = await quote();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 121000);
  let feed = await ownerAlerts("owner");
  await expect(
    ownerAlerts("owner", {
      action: "clear",
      targets: [target(feed, "categories"), target(feed, "payment-paid")],
    }),
  ).rejects.toThrow("Tindakan peringatan");
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "categories")
      ?.hidden,
  ).toBe(false);
  feed = await ownerAlerts("owner", {
    action: "acknowledge",
    targets: [target(feed, "payment-paid")],
  });
  expect(feed.items.find((a) => a.key === "payment-paid")).toMatchObject({
    hidden: false,
    disposition: "acknowledged",
  });
  await expect(
    ownerAlerts("owner", {
      action: "snooze",
      targets: [target(feed, "payment-paid")],
    }),
  ).rejects.toThrow("Tindakan peringatan");
});
it("uses grace periods and auto-resolves paid alerts only when the original sale completes", async () => {
  const { token, id } = await quote();
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key.startsWith("payment")),
  ).toBe(false);
  const time = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time + 901000);
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "payment-pending")
      ?.severity,
  ).toBe("warning");
  vi.useRealTimers();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key.startsWith("payment")),
  ).toBe(false);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 121000);
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "payment-paid")
      ?.severity,
  ).toBe("urgent");
  vi.useRealTimers();
  await changeSale(token, { id, action: "complete" });
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key.startsWith("payment")),
  ).toBe(false);
});
it("detects sync configuration, stale worker and errors without making Google calls or exposing error text", async () => {
  vi.stubEnv("SHEETS_SYNC_MODE", "test");
  vi.stubEnv("SHEETS_SPREADSHEET_ID", "bad");
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "sheets")?.reason,
  ).toBe("sheets-configuration");
  vi.stubEnv("SHEETS_SPREADSHEET_ID", TEST_SPREADSHEET_ID);
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_FILE", "/private/tmp/not-read.json");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "sheets")?.reason,
  ).toBe("sheets-stale");
  await pool.query(
    "INSERT INTO sheets_sync_target(id,spreadsheet_id,mode,last_attempt_at,last_error) VALUES ('primary',$1,'test',now(),'raw-private-error')",
    [TEST_SPREADSHEET_ID],
  );
  const feed = await ownerAlerts("owner");
  expect(feed.items.find((a) => a.key === "sheets")?.reason).toBe(
    "sheets-failed",
  );
  expect(JSON.stringify(feed)).not.toContain("raw-private-error");
  await pool.query(
    "UPDATE sheets_sync_target SET last_error=null,last_success_at=now()",
  );
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key === "sheets"),
  ).toBe(false);
  vi.stubEnv("SHEETS_SYNC_MODE", "off");
  await pool.query("UPDATE sheets_sync_target SET last_error='disabled'");
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key === "sheets"),
  ).toBe(false);
});
it("alert lifecycle never changes financial, menu, attendance or stock source rows", async () => {
  await runStockCommand({
    id: randomUUID(),
    action: "create",
    name: "Cups",
    unit: "pcs",
    openingQuantity: 1,
    lowThreshold: 3,
  });
  await quote();
  async function fingerprint() {
    const result = [];
    for (const table of [
      "menu_item",
      "employee",
      "attendance",
      "device",
      "sale",
      "sale_line",
      "stock_item",
      "stock_movement",
      "stock_recipe",
      "stock_usage",
      "sheets_sync_job",
    ])
      result.push(
        (
          await pool.query(
            `SELECT md5(coalesce(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) h FROM ${table} t`,
          )
        ).rows[0].h,
      );
    return result;
  }
  const before = await fingerprint();
  let feed = await ownerAlerts("owner");
  feed = await ownerAlerts("owner", {
    action: "clear",
    targets: [target(feed, "categories")],
  });
  feed = await ownerAlerts("owner", {
    action: "snooze",
    targets: [target(feed, "stock-low")],
  });
  await ownerAlerts("owner", {
    action: "restore",
    targets: [target(feed, "stock-low")],
  });
  expect(await fingerprint()).toEqual(before);
});

it("separates low and negative supplies and never hides negative stock after acknowledgment", async () => {
  const cup = await runStockCommand({
    id: randomUUID(),
    action: "create",
    name: "Cups",
    unit: "pcs",
    openingQuantity: 0,
    lowThreshold: 3,
  });
  await runStockCommand({
    id: randomUUID(),
    action: "recipe",
    menuItemId: product,
    revision: 0,
    lines: [{ stockItemId: cup.stockItemId!, quantity: 1 }],
  });
  const { token, id } = await quote();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await changeSale(token, { id, action: "complete" });
  let feed = await ownerAlerts("owner");
  expect(feed.items.some((a) => a.key === "stock-low")).toBe(false);
  expect(feed.items.find((a) => a.key === "stock-negative")).toMatchObject({
    severity: "urgent",
    count: 1,
  });
  feed = await ownerAlerts("owner", {
    action: "acknowledge",
    targets: [target(feed, "stock-negative")],
  });
  expect(feed.items.find((a) => a.key === "stock-negative")?.hidden).toBe(
    false,
  );
  await runStockCommand({
    id: randomUUID(),
    action: "restock",
    stockItemId: cup.stockItemId!,
    quantity: 20,
    reason: "Delivery",
  });
  expect(
    (await ownerAlerts("owner")).items.some((a) => a.key.startsWith("stock-")),
  ).toBe(false);
});

it("does not repeat a snoozed low-stock warning for each ordinary sale, but surfaces a new stock count", async () => {
  const cup = await runStockCommand({
    id: randomUUID(),
    action: "create",
    name: "Cups",
    unit: "pcs",
    openingQuantity: 3,
    lowThreshold: 5,
  });
  await runStockCommand({
    id: randomUUID(),
    action: "recipe",
    menuItemId: product,
    revision: 0,
    lines: [{ stockItemId: cup.stockItemId!, quantity: 1 }],
  });
  let feed = await ownerAlerts("owner");
  feed = await ownerAlerts("owner", {
    action: "snooze",
    targets: [target(feed, "stock-low")],
  });
  const version = target(feed, "stock-low").version;
  const { token, id } = await quote();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await changeSale(token, { id, action: "complete" });
  feed = await ownerAlerts("owner");
  expect(feed.items.find((a) => a.key === "stock-low")).toMatchObject({
    hidden: true,
    version,
  });
  await runStockCommand({
    id: randomUUID(),
    action: "restock",
    stockItemId: cup.stockItemId!,
    quantity: 1,
    reason: "Recounted delivery",
  });
  expect(
    (await ownerAlerts("owner")).items.find((a) => a.key === "stock-low")
      ?.hidden,
  ).toBe(false);
});
