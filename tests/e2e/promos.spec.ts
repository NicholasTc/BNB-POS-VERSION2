import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { login, ownerSection, pin, confirmPayment } from "./helpers";
import { hashPin, pinLookup } from "../../src/lib/credentials";
function database() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).pathname !== "/lisi_test"
  )
    throw new Error("Isolated test DB required");
  return new Pool({ connectionString: url });
}
async function startWithPromo(page: Page) {
  await login(page);
  const response = await page.request.post("/api/owner/promos", {
    data: {
      rules: {
        name: "Morning",
        percent: 10,
        scope: "all",
        productIds: [],
        minQuantity: 1,
        minDistinct: 1,
        minSpend: 0,
        maxDiscount: null,
        priority: 1,
        active: true,
      },
    },
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(response.status()).toBe(200);
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
  await page
    .getByRole("button", { name: "Tambah Jus Mangga", exact: true })
    .click();
}
test.beforeEach(async () => {
  const p = database();
  try {
    await p.query(
      "TRUNCATE promotion,employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE",
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
test("cashier stacks promos, recovers a frozen payment after refresh and cannot access owner rules", async ({
  page,
}) => {
  await login(page);
  const rules = {
    name: "Morning",
    percent: 10,
    scope: "all",
    productIds: [],
    minQuantity: 1,
    minDistinct: 1,
    minSpend: 0,
    maxDiscount: null,
    priority: 1,
    active: true,
  };
  for (const r of [
    rules,
    { ...rules, name: "Good day", percent: 20, priority: 2 },
    { ...rules, name: "Buy 3", minQuantity: 3, priority: 3 },
  ]) {
    const response = await page.request.post("/api/owner/promos", {
      data: { rules: r },
      headers: { origin: "http://127.0.0.1:3100" },
    });
    expect(response.status()).toBe(200);
  }
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
  expect((await page.request.get("/api/owner/promos")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/owner/promos", {
        data: { rules },
        headers: { origin: "http://127.0.0.1:3100" },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Tambah Jus Mangga", exact: true })
    .click();
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pilih promo", exact: true });
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: "Buy 3", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("checkbox", { name: "Good day", exact: true }).check();
  await picker.getByRole("checkbox", { name: "Morning", exact: true }).check();
  await expect(picker.getByLabel("Rincian diskon")).toContainText("Rp14.400");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/promos-cashier-mobile.png",
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Gunakan 2 promo · Lanjut", exact: true })
    .click();
  const payment = page.getByRole("dialog", { name: "QRIS", exact: true });
  await expect(payment).toContainText("Rp14.400");
  // Edit rules after the authoritative quote; only future quotes may change.
  const p = database();
  try {
    await p.query(
      "UPDATE promotion SET rules=jsonb_set(rules,'{percent}','99'),revision=revision+1",
    );
  } finally {
    await p.end();
  }
  await page.reload();
  await expect(payment).toBeVisible();
  await expect(payment.getByLabel("Rincian diskon")).toContainText("Rp14.400");
  await expect(payment.getByRole("checkbox")).not.toBeChecked();
  await confirmPayment(page);
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".receipt")).toContainText("Rp14.400");
  const verify = database();
  try {
    const result = await verify.query(
      "SELECT s.total,d.snapshot FROM sale s JOIN sale_discount d ON d.sale_id=s.id WHERE s.status='completed'",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].total).toBe(14400);
    expect(
      result.rows[0].snapshot.applied.map(
        (p: { percent: number }) => p.percent,
      ),
    ).toEqual([10, 20]);
    expect(
      (await verify.query("SELECT count(*)::int n FROM order_ticket")).rows[0]
        .n,
    ).toBe(1);
  } finally {
    await verify.end();
  }
});
test.afterEach(async () => {
  const p = database();
  try {
    await p.query("TRUNCATE promotion CASCADE");
  } finally {
    await p.end();
  }
});
test("a cashier-auth failure while loading promos never opens a payment or prepares a quote", async ({
  page,
}) => {
  await startWithPromo(page);
  let writes = 0;
  await page.route("**/api/sales", async (route) => {
    if (route.request().method() === "POST") writes++;
    await route.continue();
  });
  await page.route("**/api/promos", async (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Kasir terkunci. Masukkan PIN kembali." }),
    }),
  );
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  await expect(page.locator(".sales-layout").getByRole("alert")).toContainText(
    "Kasir terkunci",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("lisi.transaction")),
  ).toBeNull();
  await page.unroute("**/api/promos");
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Pilih promo", exact: true }),
  ).toBeVisible();
});
test("cash change uses discounted total and a lost completion response recovers one sale", async ({
  page,
}) => {
  await startWithPromo(page);
  await page.getByRole("button", { name: "Tunai", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pilih promo", exact: true });
  await picker.getByRole("checkbox", { name: "Morning", exact: true }).check();
  await picker
    .getByRole("button", { name: "Gunakan 1 promo · Lanjut", exact: true })
    .click();
  const payment = page.getByRole("dialog", { name: "Tunai", exact: true });
  await payment.getByLabel("Uang diterima", { exact: true }).fill("20000");
  await expect(payment.locator(".cash-change")).toContainText("Rp2.000");
  let lost = false;
  await page.route("**/api/sales", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "complete" &&
      !lost
    ) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await payment
    .getByRole("button", { name: "Uang diterima · Simpan", exact: true })
    .click();
  await expect(payment.getByRole("alert")).toContainText(
    "Jangan meminta pembayaran lagi",
  );
  await expect(payment.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".receipt")).toContainText("Rp18.000");
  const p = database();
  try {
    const result = await p.query(
      "SELECT total FROM sale WHERE status='completed'",
    );
    expect(result.rows).toEqual([{ total: 18000 }]);
    expect(
      (await p.query("SELECT count(*)::int n FROM sale_discount")).rows[0].n,
    ).toBe(1);
  } finally {
    await p.end();
  }
});
test("stale promo rejection preserves the cart and allows a new promo choice before payment", async ({
  page,
}) => {
  await startWithPromo(page);
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pilih promo", exact: true });
  await picker.getByRole("checkbox", { name: "Morning", exact: true }).check();
  const p = database();
  try {
    await p.query(
      "UPDATE promotion SET rules=jsonb_set(rules,'{active}','false'),revision=revision+1",
    );
  } finally {
    await p.end();
  }
  await picker
    .getByRole("button", { name: "Gunakan 1 promo · Lanjut", exact: true })
    .click();
  await expect(page.locator(".sales-layout").getByRole("alert")).toContainText(
    "Promo berubah",
  );
  await expect(
    page.getByRole("button", { name: "QRIS", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "QRIS", exact: true });
  await expect(payment).toBeVisible();
  await expect(payment.locator(".qris-total")).toContainText("Rp20.000");
  await expect(payment.getByRole("checkbox")).not.toBeChecked();
  const verify = database();
  try {
    expect((await verify.query("SELECT status,total FROM sale")).rows).toEqual([
      { status: "pending", total: 20000 },
    ]);
  } finally {
    await verify.end();
  }
});
test("owner creates a configurable promo, keeps drafts across tabs and edits safely", async ({
  page,
}) => {
  await login(page);
  await ownerSection(page, "settings");
  await page
    .locator(".owner-subnav:visible")
    .getByRole("button", { name: "Promo", exact: true })
    .click();
  const form = page.locator(".promo-management");
  await form.getByLabel("Nama promo", { exact: true }).fill("Halloween");
  await form.getByLabel("Diskon (%)", { exact: true }).fill("15");
  await form
    .getByLabel("Berlaku untuk", { exact: true })
    .selectOption("selected");
  await form.getByRole("checkbox", { name: /Jus Mangga/ }).check();
  await form.locator("summary").click();
  await form.getByLabel("Minimal jumlah item", { exact: true }).fill("3");
  await page
    .locator(".owner-subnav:visible")
    .getByRole("button", { name: "Menu kafe", exact: true })
    .click();
  await page
    .locator(".owner-subnav:visible")
    .getByRole("button", { name: "Promo", exact: true })
    .click();
  await expect(form.getByLabel("Nama promo", { exact: true })).toHaveValue(
    "Halloween",
  );
  await form.getByRole("button", { name: "Simpan promo", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Promo disimpan.");
  await expect(form.locator(".promo-list-item")).toContainText("Halloween");
  await form
    .getByRole("button", { name: "Ubah Halloween", exact: true })
    .click();
  await expect(
    form.getByLabel("Minimal jumlah item", { exact: true }),
  ).toHaveValue("3");
  await form
    .getByRole("button", { name: "Batal mengubah", exact: true })
    .click();
  await form.getByRole("button", { name: "Nonaktifkan", exact: true }).click();
  await expect(form.locator(".promo-list-item")).toContainText("Nonaktif");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/promos-owner-mobile.png",
    fullPage: true,
  });
});
