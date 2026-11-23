import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { login } from "./helpers";

function testPool() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/lisi_test")
    throw new Error("Isolated test DB required");
  return new Pool({ connectionString: url });
}

test.beforeEach(async () => {
  const pool = testPool();
  try {
    await pool.query("TRUNCATE employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE");
    await pool.query("DELETE FROM owner_preferences");
  } finally {
    await pool.end();
  }
});

test("personal owner sees actual device lifetime, expiry and revocation; opening settings never pairs their browser", async ({ page }) => {
  await login(page);
  const reminder = page.getByTestId("device-trust-reminder");
  await expect(reminder).toContainText("Belum ada perangkat terhubung.");
  const pool = testPool();
  try {
    await pool.query("INSERT INTO device(token_hash,expires_at) VALUES($1,now()+interval '30 days')", ["a".repeat(64)]);
    await page.reload();
    await expect(reminder).toContainText("Terhubung · Sisa 30 hari");
    const before = (await pool.query("SELECT * FROM device")).rows;
    expect((await page.context().cookies()).some(c => c.name === "lisi_device")).toBe(false);
    let pairWrites = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/owner/device" && request.method() === "POST") pairWrites++;
    });
    await reminder.getByRole("button", { name: "Kelola perangkat" }).click();
    await expect(page.getByRole("button", { name: "Hubungkan perangkat ini", exact: true })).toBeVisible();
    expect(pairWrites).toBe(0);
    expect((await pool.query("SELECT * FROM device")).rows).toEqual(before);
    await pool.query("UPDATE device SET expires_at=now()+interval '7 days'");
    await page.reload();
    await expect(reminder).toContainText("Sisa 7 hari");
    await expect(reminder).toHaveClass(/is-warning/);
    await expect(reminder).toContainText("Berlaku sampai");
    await expect(reminder.getByRole("button", { name: "Kelola perangkat" })).toHaveAttribute("title", /Hubungkan ulang hanya pada browser kasir toko/);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(reminder.getByRole("button", { name: "Kelola perangkat" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/device-trust-${width}.png` });
    }
    await page.locator("#owner-language").selectOption("en");
    await expect(reminder).toContainText("Connected · 7 days remaining");
    await pool.query("UPDATE device SET expires_at=now()-interval '1 second'");
    await page.reload();
    await expect(reminder).toContainText("Device connection has expired.");
    await pool.query("UPDATE device SET token_hash=NULL");
    await page.reload();
    await expect(reminder).toContainText("No device is connected.");
  } finally {
    await pool.query("DELETE FROM owner_preferences");
    await pool.end();
  }
});

test("an unavailable device-status read does not block reports or claim a healthy pairing", async ({ page }) => {
  await page.route("**/api/owner/device", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) }));
  await login(page);
  await expect(page.getByTestId("device-trust-reminder")).toContainText("Status perangkat belum dapat diperiksa.");
  await expect(page.getByTestId("sales-count")).toBeVisible();
  await page.unroute("**/api/owner/device");
  await page.reload();
  await expect(page.getByTestId("device-trust-reminder")).toContainText("Belum ada perangkat terhubung.");
});
