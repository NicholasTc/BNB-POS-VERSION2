import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { pin, login } from "./helpers";

function database() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/lisi_test") throw new Error("Isolated test database required");
  return new Pool({ connectionString: url.toString() });
}
test.beforeEach(async () => {
  const pool = database();
  try {
    await pool.query("TRUNCATE employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE");
    await pool.query("DELETE FROM owner_preferences");
    await pool.query("INSERT INTO employee(name,pin_hash,pin_lookup) VALUES('Ayu',$1,$2)", [await hashPin("0123"), pinLookup("0123")]);
    await pool.query("INSERT INTO menu_item(name,price) VALUES('Kopi susu',18000)");
  } finally { await pool.end(); }
});

test("BNB welcome exposes both portals on all sizes and owner access never pairs or signs out before choosing cashier", async ({ page }) => {
  let signouts = 0, deviceWrites = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/sign-out") signouts++;
    if (path === "/api/owner/device" && request.method() === "POST") deviceWrites++;
  });
  await page.goto("/");
  for (const [width, height] of [[1440,900], [768,1024], [390,844], [320,740]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("heading", { name: "Selamat datang di BnB." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Masuk sebagai pemilik", exact: true })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Masuk sebagai kasir", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/role-entry-${width}.png`, fullPage: true });
  }
  expect(signouts).toBe(0);
  await page.getByRole("link", { name: "Masuk sebagai pemilik", exact: true }).click();
  await expect(page.getByText("Bisa diakses dari perangkat pribadi. Tidak perlu menyiapkan kasir.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ya, hubungkan kasir", exact: true })).toHaveCount(0);
  for (const [width, height] of [[1440,900], [768,1024], [390,844], [320,740]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/role-owner-login-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Email pemilik", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("incorrect-owner-password");
  await page.getByRole("button", { name: "Masuk ke dasbor", exact: true }).click();
  await expect(page.locator(".access-error")).toBeVisible();
  expect(deviceWrites).toBe(0);
  await page.getByLabel("Kata sandi", { exact: true }).fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Tampilkan kata sandi", exact: true }).click();
  await expect(page.getByLabel("Kata sandi", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sembunyikan kata sandi", exact: true }).click();
  await page.getByRole("button", { name: "Masuk ke dasbor", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navigasi pemilik" })).toBeVisible();
  expect(deviceWrites).toBe(0);
  expect(signouts).toBe(0);
  expect((await page.request.get("/api/pos")).status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Selamat datang di BnB." })).toBeVisible();
  expect(signouts).toBe(0);
  expect((await page.request.get("/api/owner")).status()).toBe(200);
  await page.getByRole("link", { name: "Masuk sebagai kasir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Siapkan kasir di sini." })).toBeVisible();
  expect(signouts).toBeGreaterThan(0);
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  await expect(page.getByLabel("PIN karyawan", { exact: true })).toHaveCount(0);
  expect(deviceWrites).toBe(0);
});

test("leaving authenticated cashier setup confirms logout even through the brand link and keeps failed logout on the safe screen", async ({ page }) => {
  await page.goto("/owner?setup=cashier");
  await page.getByLabel("Email pemilik", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ya, hubungkan kasir", exact: true })).toBeVisible();
  expect((await page.request.get("/api/pos")).status()).toBe(401);
  await page.route("**/api/auth/sign-out", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Logout not confirmed" }) }));
  await page.getByRole("link", { name: "BNB — pilihan akses", exact: true }).click();
  await expect(page.locator(".access-error")).toHaveText("Logout not confirmed");
  await expect(page).toHaveURL(/\/owner\?setup=cashier$/);
  await expect(page.getByLabel("PIN karyawan", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/auth/sign-out");
  await page.getByRole("link", { name: "BNB — pilihan akses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang di BnB." })).toBeVisible();
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  expect((await page.request.get("/api/pos")).status()).toBe(401);
});

test("connected role entry opens the real PIN form directly, keeps invalid PINs out and preserves existing-shift login", async ({ page }) => {
  await page.goto("/owner");
  await page.getByLabel("Email pemilik", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk ke dasbor", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navigasi pemilik" })).toBeVisible();
  expect((await page.request.post("/api/owner/device", { headers: { origin: "http://127.0.0.1:3100" }, data: { action: "pair" } })).status()).toBe(200);
  await page.goto("/");
  await page.getByRole("link", { name: "Masuk sebagai kasir", exact: true }).click();
  const entry = page.getByRole("dialog", { name: "Masuk kasir", exact: true });
  await expect(entry.getByLabel("PIN karyawan", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  await entry.getByLabel("PIN karyawan", { exact: true }).fill("9999");
  await entry.getByRole("button", { name: "Masuk kasir", exact: true }).click();
  await expect(entry.getByRole("alert")).toContainText("PIN tidak cocok");
  await entry.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(entry.getByLabel("PIN karyawan", { exact: true })).toHaveValue("");
  for (const digit of ["0", "1", "2", "9"]) await entry.getByRole("button", { name: digit, exact: true }).click();
  await entry.getByRole("button", { name: "Hapus satu angka", exact: true }).click();
  await entry.getByRole("button", { name: "3", exact: true }).click();
  await entry.getByRole("button", { name: "Masuk kasir", exact: true }).click();
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByRole("button", { name: "Kunci kasir", exact: true }).click();
  await page.goto("/");
  await page.getByRole("link", { name: "Masuk sebagai kasir", exact: true }).click();
  await expect(entry.getByRole("button", { name: "Sudah mulai kerja", exact: true })).toHaveAttribute("aria-pressed", "true");
  await entry.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await entry.getByRole("button", { name: "Masuk kasir", exact: true }).click();
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  const pool = database();
  try {
    expect((await pool.query("SELECT count(*)::int n FROM attendance")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n).toBe(0);
  } finally { await pool.end(); }
  expect((await page.request.get("/api/owner/report")).status()).toBe(401);
  expect((await page.request.get("/api/admin/owners")).status()).toBe(401);
  // A bookmarked/reloaded active cashier must not queue a fresh PIN screen
  // later when the last person clocks out.
  await page.reload();
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  await pin(page, "Selesai kerja", "0123", "Selesai kerja");
  await expect(page.getByRole("dialog", { name: "Masuk kasir", exact: true })).toHaveCount(0);
});

test("automatic PIN entry restores a saved cart before asking for discard confirmation", async ({ page }) => {
  await login(page);
  expect((await page.request.post("/api/owner/device", { headers: { origin: "http://127.0.0.1:3100" }, data: { action: "pair" } })).status()).toBe(200);
  await page.goto("/?access=cashier");
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await page.getByRole("button", { name: "Tambah Kopi susu", exact: true }).click();
  await expect(page.locator(".cart-total")).toHaveText(/Rp\s*18\.000/);
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByRole("button", { name: "Kunci kasir", exact: true }).click();
  let confirmations = 0;
  let accept = false;
  page.on("dialog", dialog => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("Hapus pesanan yang belum dibayar");
    confirmations++;
    void (accept ? dialog.accept() : dialog.dismiss());
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Masuk sebagai kasir", exact: true }).click();
  await expect.poll(() => confirmations).toBe(1);
  await expect(page.getByRole("dialog", { name: "Masuk kasir", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lisi.cart")!).items[0].quantity)).toBe(1);
  await expect(page.locator(".cart-total")).toHaveText(/Rp\s*18\.000/);
  accept = true;
  await page.getByRole("button", { name: "Cashier login", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Masuk kasir", exact: true })).toBeVisible();
  await page.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await page.getByRole("dialog").getByRole("button", { name: "Masuk kasir", exact: true }).click();
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  expect(confirmations).toBe(2);
});
