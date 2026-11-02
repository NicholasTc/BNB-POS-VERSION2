import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login } from "./helpers";
const origin = "http://127.0.0.1:3100";
function database() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55439" ||
    url.pathname !== "/lisi_test"
  )
    throw new Error("Isolated test DB required");
  return new Pool({ connectionString: url.toString() });
}
async function post(page: Page, path: string, data: unknown) {
  const r = await page.request.post(path, { data, headers: { origin } });
  expect(r.status()).toBe(200);
  return r.json();
}
async function open(page: Page) {
  await page.getByRole("button", { name: /^Peringatan \(/ }).click();
  const panel = page.getByRole("dialog", {
    name: "Perlu perhatian",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return panel;
}
test.beforeEach(async () => {
  const p = database();
  try {
    await p.query(
      "TRUNCATE owner_alert_state,stock_item,stock_operation,promotion,menu_item,employee,device,owner_session,throttle,auth_rate_limit CASCADE",
    );
    await p.query("DELETE FROM owner_preferences");
    await p.query(
      "INSERT INTO menu_item(name,price) VALUES ('Juice A',20000),('Food A',15000)",
    );
    await p.query(
      "INSERT INTO employee(name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
  } finally {
    await p.end();
  }
});
test.afterEach(async () => {
  const p = database();
  try {
    await p.query(
      "TRUNCATE owner_alert_state,stock_item,stock_operation CASCADE",
    );
  } finally {
    await p.end();
  }
});
test("owner clears grouped reminders across sessions, restores them and navigates to the existing category form", async ({
  page,
  browser,
}) => {
  await login(page);
  let panel = await open(page);
  await expect(
    panel.getByRole("heading", {
      name: "Menu belum dikategorikan",
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel).toContainText("2 menu tersedia");
  await panel
    .getByRole("button", { name: "Hapus semua pengingat biasa", exact: true })
    .click();
  await expect(
    panel.getByText("Tidak ada yang perlu ditindaklanjuti saat ini.", {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Tutup", exact: true }).click();
  const other = await browser.newContext({ baseURL: origin });
  try {
    const owner = await other.newPage();
    await login(owner);
    const second = await open(owner);
    await expect(
      second.getByText("Tidak ada yang perlu ditindaklanjuti saat ini.", {
        exact: true,
      }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "Disembunyikan (1)", exact: true })
      .click();
    await second
      .getByRole("button", { name: "Tampilkan kembali", exact: true })
      .click();
    await second.getByRole("button", { name: "Tutup", exact: true }).click();
  } finally {
    await other.close();
  }
  await page.bringToFront();
  panel = await open(page);
  await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Atur kategori", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Atur kategori", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Menu kafe", exact: true }),
  ).toBeVisible();
  const items = await (await page.request.get("/api/owner/menu")).json();
  for (const item of items)
    await post(page, "/api/owner/menu", {
      id: item.id,
      name: item.name,
      price: item.price,
      active: true,
      category: "drink",
    });
  panel = await open(page);
  await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
  await expect(
    panel.getByText("Tidak ada yang perlu ditindaklanjuti saat ini.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("urgent paid transactions stay visible after acknowledgment and clear-all only removes informational reminders", async ({
  page,
}) => {
  // Guarded fixture follows real immutable pending->paid transition; no payment
  // action is exposed through the alert module itself.
  const p = database(),
    id = randomUUID();
  try {
    const employee = (await p.query("SELECT id FROM employee LIMIT 1")).rows[0]
      .id;
    const product = (
      await p.query("SELECT id,name,price FROM menu_item LIMIT 1")
    ).rows[0];
    await p.query(
      "INSERT INTO device(expires_at) VALUES(now()+interval '30 days')",
    );
    const c = await p.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "INSERT INTO sale(id,reference,device_id,cashier_id,cashier_name,request_hash,payment_method,total) VALUES($1::uuid,$2,'shared',$3,'Ayu',$1::text,'cash',$4)",
        [id, "LS-" + id, employee, product.price],
      );
      await c.query(
        "INSERT INTO sale_line(sale_id,menu_item_id,name,unit_price,quantity,subtotal) VALUES($1,$2,$3,$4,1,$4)",
        [id, product.id, product.name, product.price],
      );
      await c.query(
        "UPDATE sale SET status='paid',attested_at=now()-interval '3 minutes' WHERE id=$1",
        [id],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  } finally {
    await p.end();
  }
  await login(page);
  const panel = await open(page);
  const urgent = panel.locator(".owner-alert-card.urgent");
  await expect(urgent).toContainText("Jangan meminta pembayaran lagi");
  await urgent
    .getByRole("button", { name: "Sudah saya lihat", exact: true })
    .click();
  await expect(urgent).toContainText("Sudah dilihat");
  await expect(
    urgent.getByRole("button", { name: "Hapus pengingat", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Hapus semua pengingat biasa", exact: true })
    .click();
  await expect(urgent).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Hapus semua pengingat biasa",
      exact: true,
    }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/alerts-urgent-mobile.png",
    fullPage: true,
  });
  await urgent
    .getByRole("button", { name: "Periksa transaksi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transaksi belum selesai", exact: true }),
  ).toBeVisible();
  const verify = database();
  try {
    expect(
      (await verify.query("SELECT status FROM sale WHERE id=$1", [id])).rows[0]
        .status,
    ).toBe("paid");
  } finally {
    await verify.end();
  }
});
test("low stock can be snoozed and restored; responsive alerts follow owner language without changing stock", async ({
  page,
}) => {
  await login(page);
  await post(page, "/api/owner/stock", {
    id: randomUUID(),
    action: "create",
    name: "Cups",
    unit: "pcs",
    openingQuantity: 2,
    lowThreshold: 3,
  });
  let panel = await open(page);
  await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
  const low = panel.locator(".owner-alert-card.warning");
  await expect(low).toContainText("Stok menipis");
  await low
    .getByRole("button", { name: "Ingatkan 1 jam lagi", exact: true })
    .click();
  await expect(low).toHaveCount(0);
  await panel.getByRole("button", { name: /^Disembunyikan/ }).click();
  await expect(panel).toContainText("Diingatkan kembali");
  await panel
    .getByRole("button", { name: "Tampilkan kembali", exact: true })
    .click();
  await panel.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .getByLabel("Bahasa / Language", { exact: true })
    .selectOption("en");
  await page.getByRole("button", { name: /^Alerts \(/ }).click();
  panel = page.getByRole("dialog", { name: "Needs attention", exact: true });
  await expect(panel).toContainText("Stock running low");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/alerts-desktop.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/alerts-header-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: /^Alerts \(/ }).click();
  panel = page.getByRole("dialog", { name: "Needs attention", exact: true });
  await page.screenshot({
    path: "test-results/alerts-mobile.png",
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "Review stock", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Stock supplies", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/owner/stock")).json()).items[0]
      .balance,
  ).toBe(2);
});
test("a lost dismissal reply is resolved by read-only refresh and failures never claim an empty healthy alert list", async ({
  page,
}) => {
  await login(page);
  const panel = await open(page);
  let writes = 0;
  await page.route("**/api/owner/alerts", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await panel
    .getByRole("button", { name: "Hapus pengingat", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "belum dapat dikonfirmasi",
  );
  expect(writes).toBe(1);
  await page.unroute("**/api/owner/alerts");
  await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
  await expect(
    panel.getByText("Tidak ada yang perlu ditindaklanjuti saat ini.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.route("**/api/owner/alerts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable" }),
    }),
  );
  await panel.getByRole("button", { name: "Perbarui", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByText("Tidak ada yang perlu ditindaklanjuti saat ini.", {
      exact: true,
    }),
  ).toHaveCount(0);
});
