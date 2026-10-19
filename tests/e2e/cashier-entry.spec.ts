import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, ownerSection, staffAction } from "./helpers";

const origin = "http://127.0.0.1:3100";
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
      "TRUNCATE employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    for (const [name, code] of [
      ["Ayu", "0123"],
      ["Bima", "4567"],
    ])
      await pool.query(
        "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ($1,$2,$3)",
        [name, await hashPin(code), pinLookup(code)],
      );
    await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000)",
    );
  } finally {
    await pool.end();
  }
});
async function enterPin(page: Page, code: string, capture = false) {
  await page
    .getByRole("button", { name: "Cashier login", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cashier login",
    exact: true,
  });
  if (capture) {
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Missing login layout");
    expect(
      Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2),
    ).toBeLessThan(1);
    expect(
      Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2),
    ).toBeLessThan(1);
    await page.screenshot({ path: "test-results/cashier-entry-pin.png" });
  }
  await dialog.getByLabel("PIN karyawan", { exact: true }).fill(code);
  await dialog
    .getByRole("button", { name: "Masuk kasir", exact: true })
    .click();
}
async function pair(page: Page) {
  await login(page);
  await ownerSection(page, "settings", "device");
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
}

test("unpaired entry guides owner to explicit authorization before cashier PIN login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Siap menyambut hari?" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/cashier-entry-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Cashier login", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `test-results/cashier-entry-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Cashier login", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cashier login" });
  await expect(
    dialog.getByText(/Minta pemilik menghubungkan browser ini/),
  ).toBeVisible();
  await expect(dialog.getByLabel("PIN karyawan", { exact: true })).toHaveCount(
    0,
  );
  expect(
    (
      await page.request.post("/api/pos", {
        headers: { origin },
        data: { action: "clock-in", pin: "0123" },
      })
    ).status(),
  ).toBe(401);
  await dialog
    .getByRole("link", { name: "Hubungkan perangkat", exact: true })
    .click();
  await expect(page).toHaveURL(/owner\?setup=cashier/);
  await page.getByLabel("Email", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi").fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  const connect = page.getByRole("button", {
    name: "Hubungkan perangkat ini",
    exact: true,
  });
  await expect(connect).toBeVisible();
  // Signing in or visiting the setup URL never pairs implicitly.
  expect((await page.request.get("/api/pos")).status()).toBe(401);
  page.on("dialog", (d) => void d.accept());
  await connect.click();
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await enterPin(page, "0123", true);
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("fast PIN entry retains pairing across refresh, reuses shifts and supports a new employee", async ({
  page,
}) => {
  await pair(page);
  await enterPin(page, "9999");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "PIN tidak cocok",
  );
  expect((await page.request.get("/api/pos")).ok()).toBe(true);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("PIN karyawan", { exact: true }).fill("0123");
  await dialog
    .getByRole("button", { name: "Masuk kasir", exact: true })
    .click();
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  const initial = await (await page.request.get("/api/pos")).json();
  await staffAction(page, "Kunci kasir");
  await page.reload();
  await enterPin(page, "0123");
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  const restored = await (await page.request.get("/api/pos")).json();
  expect(restored.shifts).toEqual(initial.shifts);
  await staffAction(page, "Kunci kasir");
  await page
    .getByRole("button", { name: "Cashier login", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Mulai shift baru", exact: true })
    .click();
  await dialog.getByLabel("PIN karyawan", { exact: true }).fill("4567");
  await dialog
    .getByRole("button", { name: "Masuk kasir", exact: true })
    .click();
  await expect(page.getByLabel("Kasir: Bima", { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get("/api/pos")).json()).shifts,
  ).toHaveLength(2);
  for (const path of [
    "/api/owner",
    "/api/owner/report",
    "/api/owner/employees",
    "/api/owner/menu",
  ])
    expect((await page.request.get(path)).status()).toBe(401);
  await page.goto("/owner?setup=cashier");
  await expect(page.getByLabel("Kata sandi")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hubungkan perangkat ini", exact: true }),
  ).toHaveCount(0);
});

test("a revoked browser cannot use the login shortcut or a valid PIN", async ({
  page,
  browser,
}) => {
  await pair(page);
  await enterPin(page, "0123");
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
  const admin = await browser.newContext();
  try {
    const owner = await admin.newPage();
    await login(owner);
    expect(
      (
        await owner.request.post("/api/owner/device", {
          headers: { origin },
          data: { action: "revoke" },
        })
      ).status(),
    ).toBe(200);
    await page.bringToFront();
    await page.reload();
    await page
      .getByRole("button", { name: "Cashier login", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("PIN karyawan", { exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.post("/api/pos", {
          headers: { origin },
          data: { action: "switch", pin: "0123" },
        })
      ).status(),
    ).toBe(401);
    expect((await page.request.get("/api/owner")).status()).toBe(401);
  } finally {
    await admin.close();
  }
});
