import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { login, ownerSection, pin, confirmPayment } from "./helpers";
import { hashPin, pinLookup } from "../../src/lib/credentials";
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
async function stockSection(page: Page) {
  await ownerSection(page, "settings");
  await page
    .locator(".owner-subnav:visible")
    .getByRole("button", { name: /^(Stok|Stock)$/ })
    .click();
  await expect(
    page
      .locator(".stock-module")
      .getByRole("button", { name: /^(Tambah barang|Add stock item)$/ }),
  ).toBeEnabled();
}
async function createItem(page: Page, name = "Gelas", quantity = "10") {
  await page
    .getByRole("button", { name: "Tambah barang", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Tambah barang",
    exact: true,
  });
  await dialog.getByLabel("Nama barang", { exact: true }).fill(name);
  await dialog.getByLabel("Stok awal", { exact: true }).fill(quantity);
  await dialog.getByLabel("Ingatkan saat stok mencapai").fill("3");
  await dialog
    .getByRole("button", { name: "Simpan stok", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .locator(".stock-item")
      .filter({ hasText: name })
      .locator(".stock-balance"),
  ).toHaveText(quantity + "pcs");
}
async function stockValue() {
  const p = database();
  try {
    return (
      await p.query("SELECT balance::int FROM stock_item WHERE name='Gelas'")
    ).rows[0].balance as number;
  } finally {
    await p.end();
  }
}
test.beforeEach(async () => {
  const p = database();
  try {
    await p.query(
      "TRUNCATE stock_item,stock_operation,promotion,employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE",
    );
    await p.query("DELETE FROM owner_preferences");
    await p.query(
      "INSERT INTO menu_item (name,price) VALUES ('Jus Mangga',20000),('Jus Stroberi',25000)",
    );
    await p.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
  } finally {
    await p.end();
  }
});
test.afterEach(async () => {
  const p = database();
  try {
    await p.query("TRUNCATE stock_item,stock_operation CASCADE");
  } finally {
    await p.end();
  }
});
test("owner configures supplies and usage; the unchanged cashier sale deducts once and employee cannot manage stock", async ({
  page,
}) => {
  await login(page);
  await stockSection(page);
  await createItem(page, "Gelas", "1");
  const stockPanel = page.locator(".stock-module");
  await stockPanel
    .getByRole("button", { name: "Pemakaian per menu", exact: true })
    .click();
  await stockPanel
    .getByLabel("Pilih menu", { exact: true })
    .selectOption({ label: "Jus Mangga" });
  await stockPanel
    .getByRole("button", { name: "Tambah barang pemakaian", exact: true })
    .click();
  await stockPanel.getByLabel("Per porsi", { exact: true }).fill("2");
  await stockPanel
    .getByRole("button", { name: "Simpan pemakaian", exact: true })
    .click();
  await expect(
    stockPanel.getByText("Pemakaian disimpan.", { exact: true }),
  ).toBeVisible();
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
  expect((await page.request.get("/api/owner/stock")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/owner/stock", {
        data: { id: crypto.randomUUID(), action: "abandon" },
        headers: { origin },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Tambah Jus Mangga", exact: true })
    .click();
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  expect(await stockValue()).toBe(1);
  await confirmPayment(page);
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!", exact: true }),
  ).toBeVisible();
  expect(await stockValue()).toBe(-1);
  await page.reload();
  expect(await stockValue()).toBe(-1);
  await login(page);
  await stockSection(page);
  await expect(stockPanel.locator(".stock-warning")).toContainText(
    "Ada stok minus",
  );
  await stockPanel.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(stockPanel.locator(".stock-history-list")).toContainText(
    "Penjualan · Ayu",
  );
  await expect(stockPanel.locator(".stock-history-list")).toContainText("-2 pcs");
});
test("a lost restock response survives refresh without double entry; an unapplied attempt is safely cancelled", async ({
  page,
}) => {
  await login(page);
  await stockSection(page);
  await createItem(page);
  await page.getByRole("button", { name: "Tambah stok", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Tambah stok", exact: true });
  await dialog
    .getByLabel("Jumlah yang datang (pcs)", { exact: true })
    .fill("5");
  let dropped = false;
  await page.route("**/api/owner/stock", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "restock" &&
      !dropped
    ) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Simpan stok", exact: true })
    .click();
  await expect(
    dialog.getByText("Perubahan stok belum terkonfirmasi.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Simpan stok", exact: true }),
  ).toBeDisabled();
  expect(await stockValue()).toBe(15);
  const persisted = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith("lisi.stock.pending."),
    ),
  );
  expect(persisted).toHaveLength(1);
  expect(persisted[0][1]).toBe("1");
  await page.reload();
  await stockSection(page);
  await expect(page.locator(".stock-item .stock-balance")).toHaveText("15pcs");
  await expect(
    page.getByRole("button", { name: "Tambah stok", exact: true }),
  ).toBeEnabled();
  expect(await stockValue()).toBe(15);
  await page.unroute("**/api/owner/stock");
  await page.getByRole("button", { name: "Tambah stok", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Tambah stok", exact: true });
  await dialog
    .getByLabel("Jumlah yang datang (pcs)", { exact: true })
    .fill("7");
  await page.route("**/api/owner/stock", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "restock"
    )
      await route.abort("failed");
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Simpan stok", exact: true })
    .click();
  await expect(
    dialog.getByText("Perubahan stok belum terkonfirmasi.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Batalkan percobaan", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tambah stok", exact: true }),
  ).toBeEnabled();
  expect(await stockValue()).toBe(15);
});
test("owner adjustment checks revisions and keeps drafts; stock screens fit phone and desktop with the existing theme", async ({
  page,
}) => {
  await login(page);
  await stockSection(page);
  await createItem(page);
  const stockPanel = page.locator(".stock-module");
  await stockPanel
    .getByRole("button", { name: "Sesuaikan stok", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Sesuaikan stok",
    exact: true,
  });
  await dialog
    .getByLabel("Jumlah fisik sekarang (pcs)", { exact: true })
    .fill("8");
  await dialog
    .getByLabel("Alasan (wajib)", { exact: true })
    .fill("Hasil hitung fisik");
  const items = await (await page.request.get("/api/owner/stock")).json();
  expect(
    (
      await page.request.post("/api/owner/stock", {
        data: {
          id: crypto.randomUUID(),
          action: "restock",
          stockItemId: items.items[0].id,
          quantity: 2,
          reason: "Delivery",
        },
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  await dialog
    .getByRole("button", { name: "Simpan stok", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Stok berubah");
  await expect(
    dialog.getByLabel("Jumlah fisik sekarang (pcs)", { exact: true }),
  ).toHaveValue("8");
  expect(await stockValue()).toBe(12);
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.reload();
  await stockSection(page);
  await stockPanel
    .getByRole("button", { name: "Sesuaikan stok", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Sesuaikan stok", exact: true });
  await dialog
    .getByLabel("Jumlah fisik sekarang (pcs)", { exact: true })
    .fill("8");
  await dialog
    .getByLabel("Alasan (wajib)", { exact: true })
    .fill("Hasil hitung fisik");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/stock-adjust-mobile.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Simpan stok", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(await stockValue()).toBe(8);
  await stockPanel
    .getByRole("button", { name: "Pemakaian per menu", exact: true })
    .click();
  await stockPanel
    .getByLabel("Pilih menu", { exact: true })
    .selectOption({ label: "Jus Mangga" });
  await stockPanel
    .getByRole("button", { name: "Tambah barang pemakaian", exact: true })
    .click();
  await stockPanel.getByLabel("Per porsi", { exact: true }).fill("3");
  await stockPanel.getByRole("button", { name: "Barang", exact: true }).click();
  await stockPanel
    .getByRole("button", { name: "Pemakaian per menu", exact: true })
    .click();
  await expect(stockPanel.getByLabel("Per porsi", { exact: true })).toHaveValue(
    "3",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/stock-recipe-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/stock-recipe-desktop.png",
    fullPage: true,
  });
  await stockPanel.getByRole("button", { name: "Barang", exact: true }).click();
  await page.screenshot({
    path: "test-results/stock-items-desktop.png",
    fullPage: true,
  });
  await stockPanel.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(stockPanel.locator(".stock-history-list")).toContainText(
    "Hasil hitung fisik",
  );
  await page.screenshot({
    path: "test-results/stock-history-desktop.png",
    fullPage: true,
  });
});

test("stock follows the persisted owner language without exposing inventory through browser storage", async ({
  page,
}) => {
  await login(page);
  await stockSection(page);
  await createItem(page);
  await page
    .getByLabel("Bahasa / Language", { exact: true })
    .selectOption("en");
  const stockPanel = page.locator(".stock-module");
  await expect(
    stockPanel.getByRole("heading", { name: "Stock supplies", exact: true }),
  ).toBeVisible();
  await stockPanel.getByRole("button", { name: "Add stock", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add stock", exact: true });
  await expect(
    dialog.getByLabel("Quantity received (pcs)", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await stockSection(page);
  await expect(
    stockPanel.getByRole("heading", { name: "Stock supplies", exact: true }),
  ).toBeVisible();
  const values = await page.evaluate(() =>
    Object.values(localStorage).join(" "),
  );
  expect(values).not.toContain("Gelas");
});
