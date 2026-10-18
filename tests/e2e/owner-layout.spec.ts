import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { businessToday } from "../../src/lib/dates";
import { datePreset } from "../../src/lib/owner-dates";
import { login, ownerSection, openOwnerDates } from "./helpers";
function testPool() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).pathname !== "/lisi_test"
  )
    throw new Error("Isolated test DB required");
  return new Pool({ connectionString: url });
}
let revenue = 0,
  quantity = 0;
test.beforeEach(async () => {
  const pool = testPool();
  revenue = 0;
  quantity = 0;
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    const employee = (
      await pool.query(
        "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2) RETURNING id",
        [await hashPin("0123"), pinLookup("0123")],
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO device (expires_at) VALUES (now()+interval '30 days')",
    );
    const products = [];
    for (const [name, price, image, category] of [
      ["Jus Mangga", 20000, "mango", "drink"],
      ["Makanan A", 15000, "pastry", "food"],
      ["Jus Stroberi", 25000, "strawberry", "drink"],
      ["Es Kopi Susu", 18000, "coffee", "drink"],
    ] as const) {
      const item = (
        await pool.query(
          "INSERT INTO menu_item (name,price,image_url,category) VALUES ($1,$2,$3,$4) RETURNING id",
          [name, price, `/menu/${image}.webp`, category],
        )
      ).rows[0];
      products.push({ ...item, name, price });
    }
    const today = businessToday(),
      yesterday = datePreset("yesterday", today).from;
    for (let i = 0; i < 28; i++) {
      const id = randomUUID(),
        product = products[i % 4],
        qty = (i % 3) + 1;
      const time = `${i === 26 ? yesterday : today}T12:${String(i).padStart(2, "0")}:00+07:00`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO sale (id,reference,device_id,cashier_id,cashier_name,request_hash,payment_method,total) VALUES ($1::uuid,$2,'shared',$3,'Ayu',$1::text,$4,$5)",
          [
            id,
            "LS-" + id,
            employee,
            i % 2 ? "qris" : "cash",
            product.price * qty,
          ],
        );
        await client.query(
          "INSERT INTO sale_line (sale_id,menu_item_id,name,unit_price,quantity,subtotal) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            id,
            product.id,
            "Snapshot " + product.name,
            product.price,
            qty,
            product.price * qty,
          ],
        );
        await client.query(
          "UPDATE sale SET status='paid',attested_at=$1 WHERE id=$2",
          [time, id],
        );
        if (i !== 27)
          await client.query(
            "UPDATE sale SET status='completed',completed_at=$1 WHERE id=$2",
            [time, id],
          );
        await client.query("COMMIT");
        if (i < 26) {
          revenue += product.price * qty;
          quantity += qty;
        }
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    for (let i = 0; i < 26; i++) {
      const clockIn =
        new Date(`${today}T08:00:00+07:00`).getTime() + i * 600000;
      await pool.query(
        "INSERT INTO attendance (employee_id,clock_in,clock_out) VALUES ($1,$2,$3)",
        [employee, new Date(clockIn), new Date(clockIn + 300000)],
      );
    }
  } finally {
    await pool.end();
  }
});
test("reference summary stays compact on phone, iPad and laptop with every destination reachable", async ({
  page,
}) => {
  await login(page);
  await expect(page.getByTestId("sales-count")).toHaveText("26");
  await expect(page.getByTestId("items-count")).toHaveText(String(quantity));
  await expect(page.getByTestId("revenue")).toHaveText(
    new RegExp(revenue.toLocaleString("id-ID").replaceAll(".", "\\.")),
  );
  await expect(page.locator(".owner-bestsellers li")).toHaveCount(3);
  await expect(page.locator(".owner-recent tbody tr")).toHaveCount(3);
  for (const [name, width, height] of [
    ["laptop", 1440, 900],
    ["ipad", 1024, 768],
    ["portrait", 820, 1180],
    ["phone", 390, 844],
    ["narrow", 320, 760],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const nav = await page.locator(".owner-navigation").boundingBox();
    expect(nav).not.toBeNull();
    if (width <= 640) {
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(height);
      expect(nav!.y).toBeGreaterThan(height - 100);
    } else {
      expect(nav!.x).toBeLessThan(180);
      expect(
        await page
          .locator("#owner-summary")
          .evaluate((el) => el.getBoundingClientRect().bottom),
      ).toBeLessThanOrEqual(height + 80);
    }
    await page.screenshot({
      path: `test-results/owner-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await ownerSection(page, "transactions");
  await expect(
    page.getByRole("heading", { name: "Transaksi belum selesai", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("penerimaan pembayaran sudah dicatat; perlu Selesai", {
      exact: false,
    }),
  ).toBeVisible();
  await ownerSection(page, "staff", "employees");
  await expect(
    page.getByLabel("PIN empat angka", { exact: true }),
  ).toBeVisible();
  await ownerSection(page, "settings", "device");
  await expect(
    page.getByRole("button", { name: "Hubungkan perangkat ini", exact: true }),
  ).toBeVisible();
});
test("navigation retains complete reports, independent pagination, expanded sales and management drafts", async ({
  page,
}) => {
  await login(page);
  await page.locator(".owner-all-items summary").click();
  await expect(page.locator(".owner-all-items tbody tr")).toHaveCount(4);
  await ownerSection(page, "transactions");
  await expect(page.locator(".sale-history")).toHaveCount(25);
  await page
    .getByRole("button", { name: "Halaman penjualan berikutnya", exact: true })
    .click();
  await expect(page.locator(".sale-history")).toHaveCount(1);
  await page.locator(".sale-history summary").click();
  const reference = await page
    .locator(".sale-history .reference")
    .textContent();
  await expect(
    page.getByRole("columnheader", { name: "Menu saat dijual", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: /Snapshot / }),
  ).toBeVisible();
  await ownerSection(page, "staff");
  await page
    .getByRole("button", { name: "Halaman kehadiran berikutnya", exact: true })
    .click();
  await expect(
    page
      .getByText("Halaman 2 dari 2", { exact: false })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await ownerSection(page, "staff", "employees");
  await page.getByLabel("Nama karyawan", { exact: true }).fill("Draft staff");
  await ownerSection(page, "settings", "menu");
  await page.getByLabel("Nama menu", { exact: true }).fill("Draft product");
  await page.getByLabel("Harga akhir (Rp)", { exact: true }).fill("23000");
  await page.getByLabel("Kategori", { exact: true }).selectOption("food");
  await ownerSection(page, "settings", "device");
  await ownerSection(page, "transactions");
  await expect(page.locator(".sale-history")).toHaveCount(1);
  await expect(page.locator(".sale-history")).toHaveAttribute("open", "");
  await expect(page.locator(".sale-history .reference")).toHaveText(reference!);
  await ownerSection(page, "staff", "employees");
  await expect(page.getByLabel("Nama karyawan", { exact: true })).toHaveValue(
    "Draft staff",
  );
  await ownerSection(page, "settings", "menu");
  await expect(page.getByLabel("Nama menu", { exact: true })).toHaveValue(
    "Draft product",
  );
  await expect(
    page.getByLabel("Harga akhir (Rp)", { exact: true }),
  ).toHaveValue("23000");
  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue(
    "food",
  );
});
test("quick dates use Jakarta days and custom filters remain shared across report sections", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Kemarin", exact: true }).click();
  await expect(page.getByTestId("sales-count")).toHaveText("1");
  await page.getByRole("button", { name: "7 hari", exact: true }).click();
  await expect(page.getByTestId("sales-count")).toHaveText("27");
  await openOwnerDates(page);
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Sampai tanggal", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
  await expect(page.getByTestId("sales-count")).toHaveText("0");
  await ownerSection(page, "transactions");
  await expect(page.getByLabel("Dari tanggal", { exact: true })).toHaveValue(
    "2020-01-01",
  );
  await expect(
    page.getByText("Belum ada penjualan selesai pada rentang ini.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hari ini", exact: true }).click();
  await ownerSection(page, "summary");
  await expect(page.getByTestId("sales-count")).toHaveText("26");
});
