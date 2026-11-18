import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import sharp from "sharp";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, ownerSection, pin } from "./helpers";
function testPool() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).pathname !== "/lisi_test" ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw new Error("Isolated test database required");
  return new Pool({ connectionString: url });
}
let green: Buffer, red: Buffer;
test.beforeAll(async () => {
  green = await sharp({
    create: { width: 300, height: 400, channels: 3, background: "#24533c" },
  })
    .png()
    .toBuffer();
  red = await sharp({
    create: { width: 400, height: 300, channels: 3, background: "#a74b3f" },
  })
    .png()
    .toBuffer();
});
test.beforeEach(async () => {
  const pool = testPool();
  try {
    await pool.query(
      "TRUNCATE menu_photo_asset,employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
    await pool.query(
      "INSERT INTO menu_item (name,price,category,image_url) VALUES ('Coffee',20000,'drink','/menu/coffee.webp')",
    );
  } finally {
    await pool.end();
  }
});
test.afterEach(async () => {
  // Language is persisted on the owner account, beyond this browser context.
  const pool = testPool();
  try {
    await pool.query("DELETE FROM owner_preferences");
  } finally {
    await pool.end();
  }
});
async function editor(page: Page) {
  await login(page);
  await ownerSection(page, "settings", "menu");
  await page
    .getByRole("button", { name: "Ubah menu Coffee", exact: true })
    .click();
}
async function choose(page: Page, buffer: Buffer) {
  await page
    .locator("#menu-photo-upload")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer });
  await expect(
    page.getByText("Klik Simpan menu untuk menerapkan foto.", { exact: true }),
  ).toBeVisible();
  return page.getByLabel("Foto menu (opsional)", { exact: true }).inputValue();
}
test("owner uploads and replaces photos; a separate cashier refreshes automatically without changing its cart", async ({
  page,
  browser,
}) => {
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
  await page
    .getByRole("button", { name: "Tambah Coffee", exact: true })
    .click();
  const admin = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const owner = await admin.newPage();
    await editor(owner);
    let previous = "/menu/coffee.webp";
    for (const picture of [green, red]) {
      await owner.bringToFront();
      const url = await choose(owner, picture);
      expect(url).toMatch(/^\/api\/menu-photos\/[a-f0-9-]+\.webp$/);
      expect(url).not.toBe(previous);
      expect(
        (await (await owner.request.get("/api/owner/menu")).json())[0].imageUrl,
      ).toBe(previous);
      await owner
        .getByRole("button", { name: "Simpan menu", exact: true })
        .click();
      await expect(
        owner.getByText("Menu disimpan.", { exact: true }),
      ).toBeVisible();
      await page.bringToFront();
      await expect(
        page
          .getByRole("button", { name: "Tambah Coffee", exact: true })
          .locator("img"),
      ).toHaveAttribute("src", url, { timeout: 12000 });
      await expect(
        page.getByRole("heading", { name: "Pesanan · 1 item", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".cart-total")).toHaveText(/Rp\s*20\.000/);
      expect(
        (
          await page.request.post("/api/owner/menu/photos", {
            headers: {
              Origin: "http://127.0.0.1:3100",
              "Content-Type": "image/png",
              "X-Upload-Id": crypto.randomUUID(),
            },
            data: picture,
          })
        ).status(),
      ).toBe(401);
      await owner.bringToFront();
      await owner
        .getByRole("button", { name: "Ubah menu Coffee", exact: true })
        .click();
      previous = url;
    }
    for (const width of [1440, 390]) {
      await owner.setViewportSize({ width, height: 900 });
      await owner.locator(".menu-photo-field").scrollIntoViewIfNeeded();
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        owner.getByRole("button", { name: "Ganti foto", exact: true }),
      ).toBeVisible();
      await owner.screenshot({
        path: `test-results/menu-photo-${width}.png`,
        fullPage: false,
      });
    }
  } finally {
    await admin.close();
  }
});
test("a lost upload response retries the same file once and a failed replacement preserves the saved image", async ({
  page,
}) => {
  await editor(page);
  let lose = true;
  await page.route("**/api/owner/menu/photos", async (route) => {
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page
    .locator("#menu-photo-upload")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: green });
  await expect(
    page.getByText("Unggahan belum dikonfirmasi. Coba unggah kembali.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Foto menu (opsional)", { exact: true }),
  ).toHaveValue("/menu/coffee.webp");
  await page
    .getByRole("button", { name: "Coba unggah lagi", exact: true })
    .click();
  await expect(
    page.getByText("Klik Simpan menu untuk menerapkan foto.", { exact: true }),
  ).toBeVisible();
  const url = await page
    .getByLabel("Foto menu (opsional)", { exact: true })
    .inputValue();
  const pool = testPool();
  try {
    expect(
      (await pool.query("SELECT count(*) n FROM menu_photo_asset")).rows[0].n,
    ).toBe("1");
  } finally {
    await pool.end();
  }
  await page.getByRole("button", { name: "Simpan menu", exact: true }).click();
  await expect(page.getByText("Menu disimpan.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ubah menu Coffee", exact: true })
    .click();
  await page.unroute("**/api/owner/menu/photos");
  await page.route("**/api/owner/menu/photos", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Penyimpanan foto belum tersedia. Foto lama tetap digunakan.",
      }),
    }),
  );
  await page
    .locator("#menu-photo-upload")
    .setInputFiles({ name: "other.png", mimeType: "image/png", buffer: red });
  await expect(
    page.getByText(
      "Penyimpanan foto belum tersedia. Foto lama tetap digunakan.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Foto menu (opsional)", { exact: true }),
  ).toHaveValue(url);
  expect(
    (await (await page.request.get("/api/owner/menu")).json())[0].imageUrl,
  ).toBe(url);
});
test("owner can cancel an upload; invalid files retain the menu draft and photo actions follow owner language", async ({
  page,
}) => {
  await editor(page);
  await page.getByLabel("Nama menu", { exact: true }).fill("My draft");
  await page.locator("#menu-photo-upload").setInputFiles({
    name: "evil.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(
    page.getByText("Gunakan foto JPG, PNG, atau WebP.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Nama menu", { exact: true })).toHaveValue(
    "My draft",
  );
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/owner/menu/photos", async (route) => {
    await wait;
    await route.abort().catch(() => {});
  });
  await page
    .locator("#menu-photo-upload")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: green });
  await expect(
    page.getByRole("button", { name: "Simpan menu", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Batalkan unggahan", exact: true })
    .click();
  release();
  await expect(
    page.getByRole("button", { name: "Simpan menu", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Foto menu (opsional)", { exact: true }),
  ).toHaveValue("/menu/coffee.webp");
  await page
    .getByLabel("Bahasa / Language", { exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("button", { name: "Replace photo", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Menu name", { exact: true })).toHaveValue(
    "My draft",
  );
});
