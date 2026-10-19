import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, ownerSection, pin } from "./helpers";
test("owner can inspect the isolated sync queue; employee cannot inspect or retry it", async ({
  page,
}) => {
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
      "TRUNCATE employee,device,menu_item,sheets_sync_target,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
  } finally {
    await pool.end();
  }
  await login(page);
  await ownerSection(page, "settings", "device");
  const panel = page.getByRole("region", {
    name: "Cadangan spreadsheet",
    exact: true,
  });
  await expect(
    panel.getByText("Sinkronisasi nonaktif", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByTestId("sheets-pending")).toHaveText("0");
  await expect(
    panel.getByRole("button", { name: "Coba sinkronisasi lagi", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByText(/Sebelum produksi: berikan tautan spreadsheet live/),
  ).toBeVisible();
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Lanjut ke Cashier login", exact: true })
    .click();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  expect((await page.request.get("/api/owner/sheets")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/owner/sheets", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { action: "retry" },
      })
    ).status(),
  ).toBe(401);
  await login(page);
  await ownerSection(page, "settings", "device");
  await expect(panel.getByTestId("sheets-pending")).toHaveText("1");
  const response = await page.request.get("/api/owner/sheets");
  const data = await response.json();
  expect(data.mode).toBe("off");
  expect(data.liveSetupPending).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(
    /PRIVATE KEY|client_email|private_key|credentialFile|postgresql/,
  );
  expect(
    (
      await page.request.post("/api/owner/sheets", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { action: "retry" },
      })
    ).status(),
  ).toBe(200);
  await page.getByLabel("Bahasa / Language").selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Spreadsheet backup", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Spreadsheet backup", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/sheets-owner-mobile.png" });
});
