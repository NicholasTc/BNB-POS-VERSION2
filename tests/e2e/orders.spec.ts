import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import {
  login,
  ownerSection,
  pin,
  staffAction,
  openPayment,
  confirmPayment,
} from "./helpers";
function database() {
  const url = process.env.TEST_DATABASE_URL!;
  if (
    new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).pathname !== "/lisi_test"
  )
    throw new Error("Isolated test database required");
  return new Pool({ connectionString: url });
}
test.beforeEach(async () => {
  const pool = database();
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    for (const [name, code] of [
      ["Ayu", "0123"],
      ["Bima", "4567"],
    ])
      await pool.query(
        "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ($1,$2,$3)",
        [name, await hashPin(code), pinLookup(code)],
      );
    await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Juice A',20000),('Juice B',25000)",
    );
  } finally {
    await pool.end();
  }
});
async function start(page: Page) {
  await login(page);
  await ownerSection(page, "settings", "device");
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await expect(
    page.getByText("Perangkat terhubung selama 30 hari.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kasir", exact: true }).click();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
}
async function sale(page: Page) {
  await page
    .getByRole("button", { name: "Tambah Juice A", exact: true })
    .click({ clickCount: 2 });
  await page
    .getByRole("button", { name: "Tambah Juice B", exact: true })
    .click();
  await openPayment(page, "Tunai");
  await confirmPayment(page);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Sedang disiapkan 1/ }),
  ).toBeVisible({ timeout: 10000 });
}
test("paid orders survive reload, finish after a lost reply once, and preserve the next cart", async ({
  page,
}) => {
  await start(page);
  await sale(page);
  await page.reload();
  const pending = page.locator(".preparation-section").first();
  const finished = page.locator(".preparation-section").nth(1);
  await expect(pending.getByText("Juice A", { exact: true })).toBeVisible();
  await expect(pending.getByText("2×", { exact: true })).toBeVisible();
  await expect(pending.getByText("Kasir: Ayu", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Tambah Juice B", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Pesanan" })
      .getByRole("heading", { name: "Pesanan · 1 item", exact: true }),
  ).toBeVisible();
  let writes = 0;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    writes++;
    await route.fetch();
    await route.abort("failed");
  });
  await pending.getByRole("button", { name: /^Selesai pesanan / }).click();
  await expect(finished.getByText("Juice A", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    pending.getByRole("button", { name: /^Selesai pesanan / }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  await expect(
    page
      .getByRole("complementary", { name: "Pesanan" })
      .getByRole("heading", { name: "Pesanan · 1 item", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/orders");
  const pool = database();
  try {
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM sale WHERE status='completed'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit WHERE action='order.finish' AND details->>'saleId'=(SELECT sale_id::text FROM order_ticket LIMIT 1)",
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await pool.end();
  }
  await page.reload();
  await expect(finished.getByText("Juice A", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/owner/report")).status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".order-board").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/orders-mobile.png",
    fullPage: true,
  });
});
test("last clock-out celebrates all session staff and product quantities, warns of pending orders, auto-closes after a minute and carries the queue forward", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await pin(page, "Mulai kerja", "4567", "Mulai kerja");
  await sale(page);
  await pin(page, "Selesai kerja", "4567", "Selesai kerja");
  await expect(page.getByRole("dialog", { name: "Kerja bagus!" })).toHaveCount(
    0,
  );
  await staffAction(page, "Selesai kerja");
  await page.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await page
    .getByRole("dialog", { name: "Selesai kerja", exact: true })
    .getByRole("button", { name: "Selesai kerja", exact: true })
    .click();
  const farewell = page.getByRole("dialog", {
    name: "Kerja bagus!",
    exact: true,
  });
  await expect(farewell).toBeVisible();
  await expect(
    farewell.getByText("Terima kasih, Ayu dan Bima.", { exact: true }),
  ).toBeVisible();
  await expect(farewell.locator(".farewell-total strong")).toHaveText("3");
  await expect(
    farewell.getByText(/Masih ada 1 pesanan belum selesai/),
  ).toBeVisible();
  expect((await page.request.get("/api/orders")).status()).toBe(401);
  const bounds = await farewell.boundingBox();
  expect(
    Math.abs(bounds!.x + bounds!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(2);
  await page.screenshot({ path: "test-results/session-farewell.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await farewell.boundingBox();
  expect(mobile!.x).toBeGreaterThanOrEqual(10);
  expect(mobile!.y).toBeGreaterThanOrEqual(10);
  expect(mobile!.width).toBeLessThanOrEqual(366);
  expect(mobile!.height).toBeLessThanOrEqual(812);
  await page.screenshot({ path: "test-results/session-farewell-mobile.png" });
  await page.clock.runFor(59000);
  await expect(farewell).toBeVisible();
  await page.clock.runFor(1100);
  await expect(farewell).not.toBeVisible();
  await pin(page, "Mulai kerja", "4567", "Mulai kerja");
  await expect(
    page.getByText("Dari sesi sebelumnya", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: /Pesanan selesai 0/ }),
  ).toBeVisible();
  await page
    .locator(".preparation-section")
    .first()
    .getByRole("button", { name: /^Selesai pesanan / })
    .click();
  await expect(
    page.getByRole("heading", { name: /Pesanan selesai 1/ }),
  ).toBeVisible();
  await staffAction(page, "Selesai kerja");
  await page.getByLabel("PIN karyawan", { exact: true }).fill("4567");
  await page
    .getByRole("dialog", { name: "Selesai kerja", exact: true })
    .getByRole("button", { name: "Selesai kerja", exact: true })
    .click();
  await expect(farewell).toBeVisible();
  await expect(farewell.locator(".farewell-total strong")).toHaveText("0");
  await farewell.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(farewell).not.toBeVisible();
});
