import { test, expect, type Page, type Route } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, ownerSection, pin } from "./helpers";
test.beforeEach(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).pathname !== "/lisi_test"
  )
    throw new Error("Isolated test DB required");
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
    await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000)",
    );
  } finally {
    await pool.end();
  }
});
async function pair(page: Page) {
  await login(page);
  await ownerSection(page, "settings", "device");
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Lanjut ke Cashier login", exact: true }),
  ).toBeVisible();
}
const unavailable = (route: Route) =>
  route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Temporary startup failure" }),
  });
test("a transient owner logout failure retries automatically and never skips authorization", async ({
  page,
}) => {
  await pair(page);
  let attempts = 0,
    confirmed = false,
    posBeforeLogout = false;
  await page.route("**/api/auth/sign-out", async (route) => {
    attempts++;
    if (attempts === 1) return unavailable(route);
    const response = await route.fetch();
    confirmed = response.ok();
    await route.fulfill({ response });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/pos" && !confirmed)
      posBeforeLogout = true;
  });
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await expect(page.getByTestId("cashier-status")).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect(posBeforeLogout).toBe(false);
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expect(
    page.getByRole("button", { name: "Tambah Kopi susu", exact: true }),
  ).toBeEnabled();
});
test("a transient POS-state failure recovers without a refresh click", async ({
  page,
}) => {
  await pair(page);
  let gets = 0;
  await page.route("**/api/pos", (route) => {
    if (route.request().method() === "GET" && ++gets === 1)
      return unavailable(route);
    return route.continue();
  });
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await expect(page.getByTestId("cashier-status")).toBeVisible();
  expect(gets).toBeGreaterThanOrEqual(2);
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expect(
    page.getByRole("button", { name: "Tambah Kopi susu", exact: true }),
  ).toBeEnabled();
});
test("a stalled menu load times out, retries, and keeps the saved cart", async ({
  page,
}) => {
  await pair(page);
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click({ clickCount: 2 });
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("lisi.cart")!).items[0].quantity,
      ),
    )
    .toBe(2);
  let held: Route | null = null,
    attempts = 0,
    writes = 0;
  await page.route("**/api/menu", (route) => {
    attempts++;
    if (attempts === 1) {
      held = route;
      return;
    }
    return route.continue();
  });
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/sales" &&
      request.method() === "POST"
    )
      writes++;
  });
  await page.reload();
  await expect(page.getByText("Memuat menu…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tambah Kopi susu", exact: true }),
  ).toBeEnabled({ timeout: 16000 });
  await expect(
    page.getByRole("heading", { name: "Pesanan · 2 item", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cart-total")).toHaveText(/Rp\s*36\.000/);
  expect(writes).toBe(0);
  expect(attempts).toBeGreaterThanOrEqual(2);
  if (held) await (held as Route).abort().catch(() => {});
});
test("a transient saved-sale check recovers automatically without submitting a transaction", async ({
  page,
}) => {
  await pair(page);
  let reads = 0,
    writes = 0;
  await page.route("**/api/sales*", (route) => {
    if (route.request().method() === "POST") {
      writes++;
      return route.continue();
    }
    if (++reads === 1) return unavailable(route);
    return route.continue();
  });
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expect(
    page.getByRole("button", { name: "Tambah Kopi susu", exact: true }),
  ).toBeEnabled();
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(writes).toBe(0);
});
