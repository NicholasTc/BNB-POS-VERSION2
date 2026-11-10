import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { login as ownerLogin, ownerSection } from "./helpers";
const password = "administrator-test-2026",
  partnerPassword = "partner-password-2026";
function database() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55439" ||
    url.pathname !== "/lisi_test"
  )
    throw new Error("Isolated test database required");
  return new Pool({ connectionString: url.toString() });
}
let hash: string;
test.beforeAll(async () => {
  hash = await hashPassword(password);
});
test.beforeEach(async () => {
  const pool = database();
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_creation");
    await pool.query("DELETE FROM owner_user WHERE id<>'owner'");
    await pool.query("DELETE FROM owner_preferences");
    await pool.query(
      "INSERT INTO owner_user (id,name,email,role) VALUES ('admin','Developer','admin@test.local','admin')",
    );
    await pool.query(
      "INSERT INTO owner_account (id,account_id,provider_id,user_id,password) VALUES ('admin','admin','credential','admin',$1)",
      [hash],
    );
    await pool.query(
      "INSERT INTO menu_item (name,price,category) VALUES ('Coffee',20000,'drink')",
    );
  } finally {
    await pool.end();
  }
});
test.afterEach(async () => {
  const pool = database();
  try {
    await pool.query("DELETE FROM owner_creation");
    await pool.query("DELETE FROM owner_user WHERE id<>'owner'");
    await pool.query("DELETE FROM owner_preferences");
  } finally {
    await pool.end();
  }
});
async function loginAdmin(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Akun pemilik", exact: true }),
  ).toBeVisible();
}
async function fillOwner(page: Page) {
  await page.getByLabel("Nama pemilik", { exact: true }).fill("Partner");
  await page
    .getByLabel("Email pemilik", { exact: true })
    .fill("partner@test.local");
  await page
    .getByLabel("Kata sandi pemilik", { exact: true })
    .fill(partnerPassword);
  await page
    .getByLabel("Ulangi kata sandi pemilik", { exact: true })
    .fill(partnerPassword);
  await page
    .getByLabel("Konfirmasi kata sandi administrator", { exact: true })
    .fill(password);
}
test("URL-only administrator creates an owner and staff; the new owner sees the same café and cannot access admin", async ({
  page,
  browser,
}) => {
  await loginAdmin(page);
  await fillOwner(page);
  await page
    .getByRole("button", { name: "Buat akun pemilik", exact: true })
    .click();
  await expect(
    page.getByText(
      "Akun pemilik dibuat. Akun ini melihat data kafe yang sama.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".admin-accounts li")).toHaveCount(2);
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByLabel("Nama karyawan", { exact: true }).fill("Alicia");
  await page.getByLabel("PIN empat angka", { exact: true }).fill("2306");
  await page
    .getByRole("button", { name: "Simpan karyawan", exact: true })
    .click();
  await expect(
    page.getByText("Karyawan disimpan.", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    const owner = await context.newPage();
    await owner.goto("/owner");
    await owner.getByLabel("Email", { exact: true }).fill("partner@test.local");
    await owner.getByLabel("Kata sandi", { exact: true }).fill(partnerPassword);
    await owner.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(owner.locator(".owner-profile strong")).toHaveText("Partner");
    await expect(owner.locator('a[href="/admin"]')).toHaveCount(0);
    await ownerSection(owner, "staff", "employees");
    await expect(
      owner.getByRole("button", { name: "Ubah Alicia", exact: true }),
    ).toBeVisible();
    await ownerSection(owner, "settings", "menu");
    await expect(
      owner.getByRole("button", { name: "Ubah menu Coffee", exact: true }),
    ).toBeVisible();
    expect((await owner.request.get("/api/admin/owners")).status()).toBe(401);
    await owner.goto("/admin");
    await expect(
      owner.getByRole("button", { name: "Masuk", exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("heading", { name: "Akun pemilik", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
  expect((await page.request.get("/api/owner/report")).status()).toBe(401);
  const saved = await page.request.get("/api/admin/employees");
  expect(await saved.json()).toMatchObject([{ name: "Alicia", active: true }]);
});
test("wrong-portal owner credentials cannot enter admin; owner and cashier navigation contain no admin links", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("owner@test.local");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.locator(".admin-app").getByRole("alert")).toHaveText(
    "Email atau kata sandi tidak sesuai.",
  );
  expect((await page.request.get("/api/admin/owners")).status()).toBe(401);
  await ownerLogin(page);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Staf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
});
test("lost committed account-creation reply retries the same operation without duplicating credentials", async ({
  page,
}) => {
  await loginAdmin(page);
  await fillOwner(page);
  let lose = true;
  await page.route("**/api/admin/owners", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Buat akun pemilik", exact: true })
    .click();
  await expect(page.locator(".admin-app").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Nama pemilik", { exact: true })).toHaveValue(
    "Partner",
  );
  await page
    .getByRole("button", { name: "Buat akun pemilik", exact: true })
    .click();
  await expect(
    page.getByText(
      "Akun pemilik dibuat. Akun ini melihat data kafe yang sama.",
      { exact: true },
    ),
  ).toBeVisible();
  const pool = database();
  try {
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM owner_user WHERE email='partner@test.local'",
        )
      ).rows[0].n,
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) n FROM owner_creation")).rows[0].n,
    ).toBe("1");
  } finally {
    await pool.end();
  }
  await expect(
    page.getByLabel("Kata sandi pemilik", { exact: true }),
  ).toHaveValue("");
});
test("revocation hides administrative data and clears drafts; cached admin tabs cannot reopen after cashier handoff", async ({
  page,
}) => {
  await loginAdmin(page);
  await fillOwner(page);
  const pool = database();
  try {
    await pool.query("DELETE FROM owner_session WHERE user_id='admin'");
  } finally {
    await pool.end();
  }
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByLabel("Kata sandi pemilik", { exact: true }),
  ).toHaveCount(0);
  await loginAdmin(page);
  const cashier = await page.context().newPage();
  await cashier.goto("/");
  await expect(
    cashier.getByRole("button", { name: "Staf", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect((await page.request.get("/api/admin/session")).status()).toBe(401);
  await cashier.close();
});
test("admin forms preserve drafts across tabs and fit phone and desktop using the existing theme", async ({
  page,
}) => {
  await loginAdmin(page);
  await page
    .getByLabel("Nama pemilik", { exact: true })
    .fill("Unsaved partner");
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByLabel("Nama karyawan", { exact: true }).fill("Unsaved staff");
  await page.getByRole("button", { name: "Pemilik", exact: true }).click();
  await expect(page.getByLabel("Nama pemilik", { exact: true })).toHaveValue(
    "Unsaved partner",
  );
  await page
    .getByLabel("Bahasa / Language", { exact: true })
    .selectOption("en");
  await expect(page.getByLabel("Owner name", { exact: true })).toHaveValue(
    "Unsaved partner",
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Create owner account", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/admin-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page.getByLabel("Employee name", { exact: true })).toHaveValue(
    "Unsaved staff",
  );
});
test("an owner tab rejecting an administrator cookie does not sign out the valid administrator", async ({
  page,
}) => {
  await loginAdmin(page);
  const ownerTab = await page.context().newPage();
  try {
    await ownerTab.goto("/owner");
    await expect(
      ownerTab.getByRole("button", { name: "Masuk", exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await expect(
      page.getByRole("heading", { name: "Akun pemilik", exact: true }),
    ).toBeVisible();
    expect((await page.request.get("/api/admin/session")).status()).toBe(200);
  } finally {
    await ownerTab.close();
  }
});
