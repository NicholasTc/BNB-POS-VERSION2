import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, pin, openPayment, confirmPayment } from "./helpers";
let coffeeId: string;
test.beforeEach(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).pathname !== "/lisi_test" ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw new Error("Isolated test database required");
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "TRUNCATE employee, device, menu_item, throttle, auth_rate_limit CASCADE",
    );
    for (const [name, code] of [
      ["Ayu", "0123"],
      ["Bima", "4567"],
    ])
      await pool.query(
        "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ($1,$2,$3)",
        [name, await hashPin(code), pinLookup(code)],
      );
    const result = await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000),('Croissant',22000),('Teh lemon',15000) RETURNING id",
    );
    coffeeId = result.rows[0].id;
  } finally {
    await pool.end();
  }
});
async function start(page: Page) {
  await login(page);
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
async function checkout(page: Page) {
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  await openPayment(page);
  await expect(
    page.getByRole("heading", { name: "QRIS", exact: true }),
  ).toBeVisible();
}
test("touch cart, explicit discard on switch, cash sale and historical prices", async ({
  page,
}) => {
  await start(page);
  await pin(page, "Mulai kerja", "4567", "Mulai kerja");
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  await page.getByRole("button", { name: "Ubah", exact: true }).click();
  await page
    .getByRole("button", { name: "Tambah jumlah Kopi susu", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Jumlah Kopi susu" }),
  ).toHaveText("2");
  await pin(page, "Ganti kasir", "4567", "Jadi kasir");
  await expect(page.getByLabel("Kasir: Bima", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mulai dari satu pilihan." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tambah Croissant", exact: true })
    .click();
  await page.getByRole("button", { name: "Ubah", exact: true }).click();
  await page
    .getByRole("button", { name: "Kurangi Kopi susu", exact: true })
    .click();
  await openPayment(page, "Tunai");
  await confirmPayment(page);
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
  await expect(
    page.getByText("Tunai · Kasir Bima", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sale-receipt.png",
    fullPage: true,
  });
});
test("lost committed response survives refresh and recovers without duplicate sale", async ({
  page,
}) => {
  await start(page);
  await checkout(page);
  let lost = false;
  await page.route("**/api/sales", async (route) => {
    const payload =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : null;
    if (payload?.action === "complete" && !lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await confirmPayment(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Belum terkonfirmasi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const r = await pool.query(
      "SELECT count(*)::int AS n,sum(total)::int AS total FROM sale WHERE status='completed'",
    );
    expect(r.rows[0]).toEqual({ n: 1, total: 18000 });
  } finally {
    await pool.end();
  }
});
test("lost payment acknowledgement cannot be cancelled, can recover and finish", async ({
  page,
}) => {
  await start(page);
  await checkout(page);
  let lost = false;
  await page.route("**/api/sales", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "attest" &&
      !lost
    ) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await confirmPayment(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Belum terkonfirmasi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kembali, belum dibayar" }),
  ).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Pembayaran diterima · Simpan",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Pembayaran diterima · Simpan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
});
test("changed menu price is rejected before taking payment and can be refreshed", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query("UPDATE menu_item SET price=19000 WHERE id=$1", [
      coffeeId,
    ]);
  } finally {
    await pool.end();
  }
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "harga berubah" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Periksa status transaksi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ubah pesanan, belum dibayar", exact: true })
    .click();
  await page.getByRole("button", { name: "Ubah", exact: true }).click();
  await page
    .getByRole("button", { name: "Hapus pesanan", exact: true })
    .click();
  await checkout(page);
  await expect(page.getByText(/Rp\s*19\.000/).last()).toBeVisible();
  await page.screenshot({
    path: "test-results/pos-tablet.png",
    fullPage: true,
  });
});
