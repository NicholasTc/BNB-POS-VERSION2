import {
  test,
  expect,
  type Page,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { businessToday } from "../../src/lib/dates";
import { login, pin, openPayment, confirmPayment } from "./helpers";
const origin = "http://127.0.0.1:3100";
let coffee: string, pastry: string, ayu: string;
function testPool() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).pathname !== "/lisi_test" ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw new Error("Isolated test DB required");
  return new Pool({ connectionString: url });
}
test.beforeEach(async () => {
  const pool = testPool();
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    const employees = await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2) RETURNING id",
      [await hashPin("0123"), pinLookup("0123")],
    );
    ayu = employees.rows[0].id;
    const items = await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000),('Croissant',22000) RETURNING id",
    );
    coffee = items.rows[0].id;
    pastry = items.rows[1].id;
  } finally {
    await pool.end();
  }
});
test.afterEach(async () => {
  const pool = testPool();
  try {
    await pool.query("DELETE FROM owner_preferences");
  } finally {
    await pool.end();
  }
});
async function setup(page: Page, browser: Browser) {
  const admin = await browser.newContext({ baseURL: origin });
  const owner = await admin.newPage();
  await login(owner);
  const response = await owner.request.post("/api/owner/device", {
    headers: { origin },
    data: { action: "pair" },
  });
  expect(response.status()).toBe(200);
  await page
    .context()
    .addCookies(
      (await admin.cookies()).filter((c) => c.name === "lisi_device"),
    );
  await page.goto("/");
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  return { admin, owner };
}
async function update(admin: BrowserContext, path: string, data: unknown) {
  expect(
    (
      await admin.request.post(origin + path, { headers: { origin }, data })
    ).status(),
  ).toBe(200);
}
async function sell(page: Page) {
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  await openPayment(page);
  await confirmPayment(page);
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
}

test("owner listing/status changes refresh safely while an unpaid cart survives", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const { admin, owner } = await setup(page, browser);
  try {
    const product = page.getByRole("button", {
      name: "Tambah Kopi susu",
      exact: true,
    });
    await product.scrollIntoViewIfNeeded();
    const box = await product.boundingBox();
    if (!box) throw new Error("Product not visible");
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    expect(
      await product.evaluate((el) => getComputedStyle(el).filter),
    ).not.toBe("none");
    await page.mouse.up();
    await page.getByRole("button", { name: "Ubah", exact: true }).click();
    await page
      .getByRole("button", { name: "Tambah jumlah Kopi susu", exact: true })
      .click();
    await owner.bringToFront();
    await owner
      .getByRole("button", { name: "Ubah menu Kopi susu", exact: true })
      .click();
    await owner.getByLabel("Nama menu", { exact: true }).fill("Es kopi susu");
    await owner.getByLabel("Harga akhir (Rp)", { exact: true }).fill("19000");
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await owner.route("**/api/owner/menu", async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await owner
      .getByRole("button", { name: "Simpan menu", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Menyimpan…", exact: true }),
    ).toBeDisabled();
    await expect(
      owner.getByText("Menu disimpan.", { exact: true }),
    ).not.toBeVisible();
    release();
    await expect(
      owner.getByText("Menu disimpan.", { exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await expect(
      page.getByRole("button", { name: "Tambah Es kopi susu", exact: true }),
    ).toBeVisible({ timeout: 12000 });
    const cart = page.getByRole("complementary", { name: "Pesanan" });
    await expect(
      cart.getByRole("status", { name: "Jumlah Kopi susu" }),
    ).toHaveText("2");
    await expect(cart.locator(".cart-total")).toHaveText(/Rp\s*36\.000/);
    await update(admin, "/api/owner/menu", {
      id: pastry,
      name: "Croissant",
      price: 22000,
      active: false,
    });
    await expect(
      page.getByRole("button", { name: "Tambah Croissant", exact: true }),
    ).not.toBeVisible({ timeout: 12000 });
    await update(admin, "/api/owner/employees", {
      id: ayu,
      name: "Ayu Sari",
      active: true,
    });
    await expect(
      page.getByLabel("Kasir: Ayu Sari", { exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await update(admin, "/api/owner/employees", {
      id: ayu,
      name: "Ayu Sari",
      pin: "2222",
      active: true,
    });
    await expect(
      page.getByLabel("Kasir: Ayu Sari", { exact: true }),
    ).not.toBeVisible({ timeout: 12000 });
    await expect(cart.locator(".cart-total")).toHaveText(/Rp\s*36\.000/);
    await page.getByRole("button", { name: "Staf", exact: true }).click();
    await expect(page.getByText("Ayu Sari", { exact: true })).toBeVisible();
  } finally {
    await admin.close();
  }
});

test("background listing refresh pauses during payment and preserves the saved quote", async ({
  page,
  browser,
}) => {
  const { admin } = await setup(page, browser);
  try {
    await page
      .getByRole("button", { name: "Tambah Kopi susu", exact: true })
      .click();
    await openPayment(page);
    await expect(
      page.getByRole("heading", { name: "QRIS", exact: true }),
    ).toBeVisible();
    let reads = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/menu") reads++;
    });
    await page.clock.install();
    await update(admin, "/api/owner/menu", {
      id: coffee,
      name: "Kopi baru",
      price: 26000,
      active: true,
    });
    await page.clock.runFor(11000);
    expect(reads).toBe(0);
    const cart = page.getByRole("dialog", { name: "QRIS", exact: true });
    await cart.locator("summary").click();
    await expect(cart.locator(".reference")).toBeVisible();
    await expect(cart.locator(".qris-total strong")).toHaveText(/Rp\s*18\.000/);
    await confirmPayment(page);
    await expect(
      page.getByRole("heading", { name: "Penjualan tersimpan!" }),
    ).toBeVisible();
    await page.clock.runFor(5100);
    await expect(
      page.getByRole("button", { name: "Tambah Kopi baru", exact: true }),
    ).toBeVisible();
    const pool = testPool();
    try {
      const r = await pool.query(
        "SELECT name,unit_price,quantity,subtotal FROM sale_line",
      );
      expect(r.rows).toEqual([
        { name: "Kopi susu", unit_price: 18000, quantity: 1, subtotal: 18000 },
      ]);
    } finally {
      await pool.end();
    }
  } finally {
    await admin.close();
  }
});

test("owner reports update after sales without losing drafts, disclosures or applied dates", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const { admin, owner } = await setup(page, browser);
  try {
    await expect(owner.getByTestId("sales-count")).toHaveText("0");
    await sell(page);
    await owner.bringToFront();
    await expect(owner.getByTestId("sales-count")).toHaveText("1", {
      timeout: 12000,
    });
    const details = owner.locator("details").first();
    await details.locator("summary").click();
    const reference = await details.locator(".reference").textContent();
    if (!reference) throw new Error("Missing sale reference");
    await owner.getByLabel("Dari tanggal", { exact: true }).fill("2020-01-01");
    await owner
      .getByLabel("Sampai tanggal", { exact: true })
      .fill("2020-01-01");
    await page
      .getByRole("button", { name: "Pesanan baru", exact: true })
      .click();
    await sell(page);
    await owner.bringToFront();
    await expect(owner.getByTestId("sales-count")).toHaveText("2", {
      timeout: 12000,
    });
    await expect(owner.getByLabel("Dari tanggal", { exact: true })).toHaveValue(
      "2020-01-01",
    );
    await expect(
      owner.locator("details").filter({ hasText: reference }),
    ).toHaveAttribute("open", "");
    let release!: () => void, captured!: () => void, finished!: () => void;
    const held = new Promise<void>((r) => {
        release = r;
      }),
      seen = new Promise<void>((r) => {
        captured = r;
      }),
      done = new Promise<void>((r) => {
        finished = r;
      });
    let hold = true;
    await owner.route("**/api/owner/report?**", async (route) => {
      if (
        hold &&
        new URL(route.request().url()).searchParams.get("from") ===
          businessToday()
      ) {
        hold = false;
        const response = await route.fetch();
        captured();
        await held;
        try {
          await route.fulfill({ response });
        } finally {
          finished();
        }
      } else await route.continue();
    });
    await owner.evaluate(() => window.dispatchEvent(new Event("focus")));
    await seen;
    await owner.getByRole("button", { name: "Tampilkan", exact: true }).click();
    await expect(owner.getByTestId("sales-count")).toHaveText("0");
    release();
    await done;
    await expect(owner.getByTestId("sales-count")).toHaveText("0");
    await expect(
      owner.getByText("2020-01-01 sampai 2020-01-01", { exact: true }),
    ).toBeVisible();
    await owner.unroute("**/api/owner/report?**");
    await owner.route("**/api/owner/report?**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Layanan belum tersedia." }),
      }),
    );
    await owner.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      owner.getByText(
        "Pembaruan otomatis tertunda. Data terakhir tetap ditampilkan.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 12000 });
    await expect(owner.getByTestId("sales-count")).toHaveText("0");
    await expect(owner.getByLabel("Dari tanggal", { exact: true })).toHaveValue(
      "2020-01-01",
    );
    await owner.unroute("**/api/owner/report?**");
    await owner.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      owner.getByText("Pembaruan otomatis aktif.", { exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await owner.screenshot({
      path: "test-results/live-owner-report.png",
      fullPage: true,
    });
  } finally {
    await admin.close();
  }
});

test("owner language preserves form drafts and persists through reload, logout and a fresh browser session", async ({
  page,
  browser,
}) => {
  const { admin, owner } = await setup(page, browser);
  let fresh: BrowserContext | undefined;
  try {
    await owner.getByLabel("Nama menu", { exact: true }).fill("Draft item");
    await owner.getByLabel("Harga akhir (Rp)", { exact: true }).fill("12345");
    await owner.getByLabel("Dari tanggal", { exact: true }).fill("2020-01-01");
    await owner
      .getByLabel("Bahasa / Language", { exact: true })
      .selectOption("en");
    await expect(
      owner.getByRole("heading", { name: "Hello, Pemilik." }),
    ).toBeVisible();
    await expect(
      owner.getByText("Language saved.", { exact: true }),
    ).toBeVisible();
    await expect(owner.getByLabel("Menu name", { exact: true })).toHaveValue(
      "Draft item",
    );
    await expect(
      owner.getByLabel("Final price (Rp)", { exact: true }),
    ).toHaveValue("12345");
    await expect(owner.getByLabel("From date", { exact: true })).toHaveValue(
      "2020-01-01",
    );
    await expect(
      owner.getByRole("heading", { name: "Employee attendance", exact: true }),
    ).toBeVisible();
    await owner.screenshot({
      path: "test-results/owner-english.png",
      fullPage: true,
    });
    await owner.reload();
    await expect(
      owner.getByLabel("Bahasa / Language", { exact: true }),
    ).toHaveValue("en");
    await expect(
      owner.getByRole("heading", { name: "Café settings", exact: true }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Sign out", exact: true }).click();
    await owner.getByLabel("Email", { exact: true }).fill("owner@test.local");
    await owner
      .getByLabel("Password", { exact: true })
      .fill("test-owner-password-2026");
    await owner.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      owner.getByRole("heading", { name: "Hello, Pemilik." }),
    ).toBeVisible();
    fresh = await browser.newContext({ baseURL: origin });
    const other = await fresh.newPage();
    await other.goto("/owner");
    await other.getByLabel("Email", { exact: true }).fill("owner@test.local");
    await other
      .getByLabel("Kata sandi", { exact: true })
      .fill("test-owner-password-2026");
    await other.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(
      other.getByRole("heading", { name: "Hello, Pemilik." }),
    ).toBeVisible();
    await expect(
      other.getByLabel("Bahasa / Language", { exact: true }),
    ).toHaveValue("en");
    await other
      .getByLabel("Bahasa / Language", { exact: true })
      .selectOption("id");
    await expect(
      other.getByRole("heading", { name: "Halo, Pemilik." }),
    ).toBeVisible();
  } finally {
    await fresh?.close();
    await admin.close();
  }
});

test("personal owner browsers need no cashier pairing and can use reports concurrently", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const { admin } = await setup(page, browser);
  const laptop = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1280, height: 900 },
  });
  const tablet = await browser.newContext({
    baseURL: origin,
    viewport: { width: 820, height: 1180 },
  });
  try {
    const first = await laptop.newPage(),
      second = await tablet.newPage();
    await login(first);
    await login(second);
    for (const context of [laptop, tablet]) {
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === "lisi_device",
        ),
      ).toBe(false);
      expect((await context.request.get("/api/owner")).status()).toBe(200);
      expect((await context.request.get("/api/owner/report")).status()).toBe(
        200,
      );
    }
    await expect(first.getByTestId("sales-count")).toHaveText("0");
    await expect(second.getByTestId("sales-count")).toHaveText("0");
    await sell(page);
    await first.bringToFront();
    await expect(first.getByTestId("sales-count")).toHaveText("1", {
      timeout: 12000,
    });
    await second.bringToFront();
    await expect(second.getByTestId("sales-count")).toHaveText("1", {
      timeout: 12000,
    });
    await first.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(
      first.getByRole("button", { name: "Masuk", exact: true }),
    ).toBeVisible();
    expect((await laptop.request.get("/api/owner")).status()).toBe(401);
    expect((await tablet.request.get("/api/owner")).status()).toBe(200);
    const cashier = await page.request.get("/api/pos");
    expect(cashier.status()).toBe(200);
    expect((await cashier.json()).cashier.name).toBe("Ayu");
  } finally {
    await laptop.close();
    await tablet.close();
    await admin.close();
  }
});
