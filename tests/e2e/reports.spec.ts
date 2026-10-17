import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login } from "./helpers";
test("owner date filters, breakdowns, itemized history and overnight attendance", async ({
  page,
}) => {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).pathname !== "/lisi_test" ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw new Error("Isolated test DB required");
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,throttle,auth_rate_limit CASCADE",
    );
    const e = await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2) RETURNING id",
      [await hashPin("0123"), pinLookup("0123")],
    );
    const employee = e.rows[0].id;
    const m = await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000) RETURNING id",
    );
    await pool.query(
      "INSERT INTO device (expires_at) VALUES (now()+interval '30 days')",
    );
    for (const [time, qty, method] of [
      ["2026-10-16T17:00:00Z", 2, "cash"],
      ["2026-10-17T16:59:59Z", 1, "qris"],
    ] as const) {
      const id = randomUUID();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO sale (id,reference,device_id,cashier_id,cashier_name,request_hash,payment_method,total) VALUES ($1::uuid,$2,'shared',$3,'Ayu',$1::text,$4,$5)",
          [id, "LS-" + id, employee, method, 18000 * qty],
        );
        await client.query(
          "INSERT INTO sale_line (sale_id,menu_item_id,name,unit_price,quantity,subtotal) VALUES ($1,$2,'Kopi susu',18000,$3,$4)",
          [id, m.rows[0].id, qty, 18000 * qty],
        );
        await client.query(
          "UPDATE sale SET status='paid',attested_at=$1 WHERE id=$2",
          [time, id],
        );
        await client.query(
          "UPDATE sale SET status='completed',completed_at=$1 WHERE id=$2",
          [time, id],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    await pool.query(
      "INSERT INTO attendance (employee_id,clock_in,clock_out) VALUES ($1,'2026-10-16T12:00:00Z','2026-10-16T18:00:00Z')",
      [employee],
    );
  } finally {
    await pool.end();
  }
  await login(page);
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2026-10-17");
  await page.getByLabel("Sampai tanggal", { exact: true }).fill("2026-10-17");
  await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
  await expect(page.getByTestId("revenue")).toHaveText(/Rp\s*54\.000/);
  await expect(page.getByTestId("sales-count")).toHaveText("2");
  await page.locator("details").first().locator("summary").click();
  await expect(
    page.getByRole("columnheader", { name: "Menu saat dijual", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /17 Okt 2026, 01\.00/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/owner-dashboard.png",
    fullPage: true,
  });
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2026-10-18");
  await page.getByLabel("Sampai tanggal", { exact: true }).fill("2026-10-18");
  await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
  await expect(page.getByTestId("sales-count")).toHaveText("0");
  await expect(
    page.getByText("Belum ada penjualan selesai pada rentang ini.", {
      exact: true,
    }),
  ).toBeVisible();
});
