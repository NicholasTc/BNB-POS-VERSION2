import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { ownerSection, login, pin, openPayment } from "./helpers";
const origin = "http://127.0.0.1:3100";
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
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
    for (const [name, price, image] of [
      ["Jus Mangga", 20000, "mango"],
      ["Jus Stroberi", 25000, "strawberry"],
      ["Es Kopi Susu", 18000, "coffee"],
      ["Jus Alpukat", 25000, "avocado"],
      ["Es Teh", 8000, "tea"],
      ["Air Mineral", 5000, "water"],
    ] as const) {
      await pool.query(
        "INSERT INTO menu_item (name,price,category,image_url) VALUES ($1,$2,'drink',$3)",
        [name, price, `/menu/${image}.webp`],
      );
    }
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
async function referenceCart(page: Page) {
  await page
    .getByRole("button", { name: "Tambah Jus Mangga", exact: true })
    .click({ clickCount: 2 });
  await page
    .getByRole("button", { name: "Tambah Es Kopi Susu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pesanan · 3 item", exact: true }),
  ).toBeVisible();
}
test("reference catalog and cash sheet calculate change and one Save completes exactly once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 630, height: 1364 });
  await start(page);
  await referenceCart(page);
  const mango = page.getByRole("button", {
    name: "Tambah Jus Mangga",
    exact: true,
  });
  await expect(mango).toHaveClass(/in-cart/);
  await expect(
    mango.getByLabel("2 dalam pesanan", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".product-photo")
        .evaluateAll((imgs) =>
          imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page
    .getByRole("button", { name: "Tutup menu staf", exact: true })
    .click();
  await expect(
    page.getByText("Selamat bekerja!", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "test-results/reference-catalog.png",
    fullPage: true,
  });
  await openPayment(page, "Tunai");
  const sheet = page.getByRole("dialog", { name: "Tunai", exact: true });
  const save = sheet.getByRole("button", {
    name: "Uang diterima · Simpan",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await sheet.getByLabel("Uang diterima", { exact: true }).fill("57000");
  await expect(save).toBeDisabled();
  await expect(
    sheet.getByText("Uang diterima belum cukup.", { exact: true }),
  ).toBeVisible();
  await sheet.getByLabel("Uang diterima", { exact: true }).fill("");
  for (const key of ["1", "0", "0", "000"])
    await sheet.getByRole("button", { name: key, exact: true }).click();
  await expect(sheet.locator(".cash-change strong")).toHaveText(/Rp\s*42\.000/);
  await expect(save).toBeEnabled();
  await page.screenshot({ path: "test-results/reference-cash.png" });
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    seen = new Promise<void>((resolve) => {
      captured = resolve;
    });
  await page.route("**/api/sales", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "complete"
    ) {
      captured();
      await held;
    }
    await route.continue();
  });
  await save.click();
  await seen;
  await expect(
    sheet.getByRole("button", { name: "Menyimpan…", exact: true }),
  ).toBeDisabled();
  await expect(
    sheet.getByRole("button", { name: "Tutup", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).not.toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
  const pool = testPool();
  try {
    expect(
      (await pool.query("SELECT total,status,payment_method FROM sale")).rows,
    ).toEqual([{ total: 58000, status: "completed", payment_method: "cash" }]);
  } finally {
    await pool.end();
  }
});
test("QRIS sheet gates Save, close/reopen retains quote, checkbox alone never records payment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 630, height: 1364 });
  await start(page);
  await referenceCart(page);
  await openPayment(page);
  let sheet = page.getByRole("dialog", { name: "QRIS", exact: true });
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("lisi.transaction")!).id,
  );
  await expect(
    sheet.getByRole("button", {
      name: "Pembayaran diterima · Simpan",
      exact: true,
    }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tambah Jus Mangga", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Lanjutkan pembayaran", exact: true })
    .click();
  sheet = page.getByRole("dialog", { name: "QRIS", exact: true });
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("lisi.transaction")!).id,
    ),
  ).toBe(before);
  await page.screenshot({ path: "test-results/reference-qris.png" });
  await sheet.getByRole("checkbox").check();
  expect(
    (await (await page.request.get("/api/sales?id=" + before)).json()).status,
  ).toBe("pending");
  await sheet
    .getByRole("button", { name: "Pembayaran diterima · Simpan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/sales?id=" + before)).json()).status,
  ).toBe("completed");
});
test("owner photo/category edits filter live, broken photos fall back, cart editing stays intact", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page
    .getByRole("button", { name: "Tambah Jus Mangga", exact: true })
    .click();
  const admin = await browser.newContext({ baseURL: origin });
  try {
    const owner = await admin.newPage();
    await login(owner);
    await ownerSection(owner, "settings", "menu");
    await owner
      .getByRole("button", { name: "Ubah menu Jus Mangga", exact: true })
      .click();
    await owner.getByLabel("Kategori", { exact: true }).selectOption("food");
    await owner
      .getByLabel("Foto menu (opsional)", { exact: true })
      .fill("/menu/missing.webp");
    await owner
      .getByRole("button", { name: "Simpan menu", exact: true })
      .click();
    await expect(
      owner.getByText("Menu disimpan.", { exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/menu")).json()).find(
            (i: { name: string }) => i.name === "Jus Mangga",
          ).category,
      )
      .toBe("food");
    await page.getByRole("button", { name: "Makanan", exact: true }).click();
    const product = page.getByRole("button", {
      name: "Tambah Jus Mangga",
      exact: true,
    });
    await expect(product).toBeVisible({ timeout: 12000 });
    await expect(product.locator("img")).toHaveAttribute(
      "src",
      "/menu/pastry.webp",
    );
    await page.getByRole("button", { name: "Minuman", exact: true }).click();
    await expect(product).not.toBeVisible();
    await page.getByRole("button", { name: "Ubah", exact: true }).click();
    await page
      .getByRole("button", { name: "Tambah jumlah Jus Mangga", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Jumlah Jus Mangga", exact: true }),
    ).toHaveText("2");
    await expect(page.locator(".cart-total")).toHaveText(/Rp\s*40\.000/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await admin.close();
  }
});

test("reference header keeps locked/active proportions and Cashier login reauthenticates without duplicating shifts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 784, height: 930 });
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
  const status = page.getByTestId("cashier-status");
  await expect(
    status.getByText("Belum ada kasir", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tambah Jus Mangga", exact: true }),
  ).toBeDisabled();
  const locked = await status.boundingBox();
  const tabs = await page.locator(".catalog-tabs").boundingBox();
  const logo = await page.locator(".lisi-logo").boundingBox();
  const staff = await page
    .getByRole("button", { name: "Staf", exact: true })
    .boundingBox();
  if (!locked || !tabs || !logo || !staff)
    throw new Error("Header layout missing");
  expect(Math.abs(locked.x - tabs.x)).toBeLessThan(1);
  expect(Math.abs(locked.width - tabs.width)).toBeLessThan(1);
  expect(
    Math.abs(staff.x + staff.width - (locked.x + locked.width)),
  ).toBeLessThan(1);
  expect(
    Math.abs(logo.y + logo.height / 2 - (staff.y + staff.height / 2)),
  ).toBeLessThan(1);
  expect(locked.height).toBeGreaterThanOrEqual(110);
  expect(locked.height).toBeLessThanOrEqual(118);
  await page.screenshot({ path: "test-results/header-before.png" });
  await page
    .getByRole("button", { name: "Cashier login", exact: true })
    .click();
  await page.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Masuk kasir", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(status.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  await expect(status.getByText("Aktif", { exact: true })).toBeVisible();
  const active = await status.boundingBox();
  expect(active?.height).toBe(locked.height);
  expect(active?.y).toBe(locked.y);
  await expect(
    page.getByText("Selamat bekerja!", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({ path: "test-results/header-after.png" });
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByRole("button", { name: "Kunci kasir", exact: true }).click();
  await expect(
    status.getByText("Belum ada kasir", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cashier login", exact: true })
    .click();
  await page.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Masuk kasir", exact: true })
    .click();
  await expect(status.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/header-mobile.png" });
  const pool = testPool();
  try {
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS shifts FROM attendance WHERE clock_out IS NULL",
        )
      ).rows[0].shifts,
    ).toBe(1);
    await pool.query("UPDATE employee SET name=$1", ["Ayu ".repeat(20).trim()]);
  } finally {
    await pool.end();
  }
  await page.reload();
  await expect(status.getByText("Aktif", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
