import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import { login, pin } from "./helpers";
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
test.beforeEach(async () => {
  const pool = testPool();
  try {
    await pool.query(
      "TRUNCATE employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE",
    );
    await pool.query("DELETE FROM owner_preferences");
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
    await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000)",
    );
  } finally {
    await pool.end();
  }
});
async function pair(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await expect(
    page.getByText("Perangkat terhubung selama 30 hari.", { exact: false }),
  ).toBeVisible();
}
async function expectEmployeeDenied(page: Page) {
  for (const path of [
    "/api/owner",
    "/api/owner/report",
    "/api/owner/employees",
    "/api/owner/menu",
  ])
    expect(
      (
        await page.request.get(path, {
          headers: { "x-role": "owner", "x-user-id": "owner" },
        })
      ).status(),
    ).toBe(401);
  for (const path of [
    "/api/owner/employees",
    "/api/owner/menu",
    "/api/owner/device",
    "/api/owner/preferences",
  ])
    expect(
      (
        await page.request.post(path, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: {},
        })
      ).status(),
    ).toBe(401);
}
test("direct cashier navigation revokes owner cookies and cached owner tabs cannot reopen management", async ({
  page,
}) => {
  await login(page);
  await pair(page);
  const cookies = await page.context().cookies();
  const ownerCookie = cookies
    .filter((c) => c.name.includes("session_token"))
    .map((c) => c.name + "=" + c.value)
    .join("; ");
  expect(
    cookies
      .filter(
        (c) => c.name.includes("session_token") || c.name === "lisi_device",
      )
      .every((c) => c.httpOnly),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.cookie.includes("session_token") ||
        document.cookie.includes("lisi_device"),
    ),
  ).toBe(false);
  const other = await page.context().newPage();
  await other.goto("/owner");
  await expect(
    other.getByRole("heading", { name: "Halo, Pemilik." }),
  ).toBeVisible();
  await page.bringToFront();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/owner", { headers: { cookie: ownerCookie } })
    ).status(),
  ).toBe(401);
  await other.bringToFront();
  await expect(
    other.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(await other.getByLabel("Nama karyawan", { exact: true }).count()).toBe(
    0,
  );
  await page.bringToFront();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(await page.getByTestId("sales-count").count()).toBe(0);
  await page.goto("/");
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expectEmployeeDenied(page);
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByRole("link", { name: "Pemilik", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel("Nama karyawan", { exact: true }).count()).toBe(
    0,
  );
});
test("expired or remotely revoked owner access removes dashboard data and management forms", async ({
  page,
}) => {
  const response = await page.goto("/owner");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await login(page);
  await page.getByLabel("Nama menu", { exact: true }).fill("Draft preserved");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await expect(page.getByLabel("Nama menu", { exact: true })).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Nama menu", { exact: true })).toHaveValue(
    "Draft preserved",
  );
  await expect(page.getByLabel("Nama menu", { exact: true })).toBeVisible();
  const pool = testPool();
  try {
    await pool.query(
      "UPDATE owner_session SET expires_at=now()-interval '1 second'",
    );
  } finally {
    await pool.end();
  }
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel("Nama menu", { exact: true }).count()).toBe(0);
  expect(await page.getByTestId("sales-count").count()).toBe(0);
  await expectEmployeeDenied(page);
  await login(page);
  const fresh = testPool();
  try {
    await fresh.query("DELETE FROM owner_session");
  } finally {
    await fresh.end();
  }
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel("Nama karyawan", { exact: true }).count()).toBe(
    0,
  );
});
test("cashier handoff stays blocked until owner logout is confirmed and safely retries", async ({
  page,
}) => {
  await login(page);
  await pair(page);
  let posReads = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/pos") posReads++;
  });
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "Layanan belum tersedia. Data belum dikonfirmasi; coba periksa kembali.",
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "Layanan belum tersedia" }),
  ).toBeVisible();
  expect(posReads).toBe(0);
  expect(
    await page
      .getByRole("button", { name: "Tambah Kopi susu", exact: true })
      .count(),
  ).toBe(0);
  await page.unroute("**/api/auth/sign-out");
  await page
    .getByRole("button", { name: "Periksa koneksi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  await expectEmployeeDenied(page);
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expect(page.getByLabel("Kasir: Ayu", { exact: true })).toBeVisible();
});

test("owner inactivity locks after fifteen minutes; genuine activity preserves idle access without extending expiry", async ({
  page,
}) => {
  await login(page);
  const pool = testPool();
  try {
    await pool.query(
      "UPDATE owner_session SET updated_at=now()-interval '14 minutes'",
    );
    const before = (
      await pool.query("SELECT updated_at,expires_at FROM owner_session")
    ).rows[0];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("Nama menu", { exact: true })).toBeVisible();
    expect(
      (await pool.query("SELECT updated_at FROM owner_session")).rows[0]
        .updated_at,
    ).toEqual(before.updated_at);
    await page.keyboard.press("Tab");
    await expect
      .poll(async () =>
        (
          await pool.query("SELECT updated_at FROM owner_session")
        ).rows[0].updated_at.getTime(),
      )
      .toBeGreaterThan(before.updated_at.getTime());
    expect(
      (await pool.query("SELECT expires_at FROM owner_session")).rows[0]
        .expires_at,
    ).toEqual(before.expires_at);
    await pool.query(
      "UPDATE owner_session SET updated_at=now()-interval '16 minutes'",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("button", { name: "Masuk", exact: true }),
    ).toBeVisible();
    expect(
      await page.getByLabel("Nama karyawan", { exact: true }).count(),
    ).toBe(0);
    await expectEmployeeDenied(page);
  } finally {
    await pool.end();
  }
});
