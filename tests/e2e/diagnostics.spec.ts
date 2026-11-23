import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { readFile } from "node:fs/promises";
import { persistDiagnostics } from "../../src/modules/diagnostics/store";
import { diagnosticEvent } from "../../src/modules/diagnostics/safe";
import { randomUUID } from "node:crypto";
const password = "diagnostic-browser-test-2026";
let hash: string;
function database() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/lisi_test") throw new Error("Isolated test database required");
  return new Pool({ connectionString: url.toString() });
}
test.beforeAll(async () => { hash = await hashPassword(password); });
test.beforeEach(async () => {
  const pool = database();
  try {
    await pool.query("TRUNCATE diagnostic_issue,employee,device,menu_item,owner_session,throttle,auth_rate_limit CASCADE");
    await pool.query("DELETE FROM owner_creation");
    await pool.query("DELETE FROM owner_user WHERE id<>'owner'");
    await pool.query("DELETE FROM owner_preferences");
    await pool.query("INSERT INTO owner_user(id,name,email,role) VALUES('admin','Developer','admin@test.local','admin')");
    await pool.query("INSERT INTO owner_account(id,account_id,provider_id,user_id,password) VALUES('admin','admin','credential','admin',$1)", [hash]);
    await persistDiagnostics(pool, [diagnosticEvent({ kind: "request_failed", source: "server", path: "/api/sales?token=DO_NOT_STORE", method: "POST", status: 503, error: Object.assign(new Error("DO_NOT_STORE password 0123"), { code: "40P01", stack: "Error\n at src/modules/sales.ts:42:3" }) }, randomUUID(), new Date(), "a".repeat(40))]);
  } finally { await pool.end(); }
});
test.afterEach(async () => {
  const pool = database();
  try { await pool.query("DELETE FROM owner_creation"); await pool.query("DELETE FROM owner_user WHERE id<>'owner'"); await pool.query("DELETE FROM owner_preferences"); }
  finally { await pool.end(); }
});
async function login(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Akun pemilik", exact: true })).toBeVisible();
  await page.locator("#admin-language").selectOption("en");
  await page.getByRole("button", { name: "System logs", exact: true }).click();
}

test("administrator reads a clear investigation, exports only safe evidence and resolves without touching sales", async ({ page }) => {
  expect((await page.request.get("/api/admin/logs")).status()).toBe(401);
  await login(page);
  await page.getByRole("button", { name: /A server request failed/ }).click();
  await expect(page.getByRole("heading", { name: "A server request failed", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start investigating here" })).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("PostgreSQL detected a deadlock", { exact: false })).toBeVisible();
  await expect(page.getByText("src/modules/sales.ts:42:3", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  const path = await (await downloaded).path();
  expect(path).not.toBeNull();
  const report = await readFile(path!, "utf8");
  expect(JSON.parse(report).issue.path).toBe("/api/sales");
  for (const secret of ["DO_NOT_STORE", "0123", "password", "@test.local"]) expect(report).not.toContain(secret);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/diagnostics-${width}.png`, fullPage: true });
  }
  const pool = database();
  try {
    const sales = (await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n;
    await page.getByRole("button", { name: "Mark resolved", exact: true }).click();
    await expect(page.getByText("Marked resolved. A new occurrence will reopen it.")).toBeVisible();
    expect((await pool.query("SELECT count(*)::int n FROM sale")).rows[0].n).toBe(sales);
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("resolved");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("button", { name: /A server request failed/ })).toBeVisible();
    // Applying identical filters must finish, rather than leave a loading spinner.
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByRole("button", { name: /A server request failed/ })).toBeVisible();
  } finally { await pool.end(); }
});

test("signed-in browser crashes produce sanitized untrusted reports and no report can promote access", async ({ page }) => {
  await login(page);
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { error: new Error("DO_NOT_STORE cookie private password 0123") })));
  const pool = database();
  try {
    await expect.poll(async () => (await pool.query("SELECT count(*)::int n FROM diagnostic_issue WHERE source='browser' AND kind='browser_crash'")).rows[0].n).toBe(1);
    const rows = JSON.stringify((await pool.query("SELECT * FROM diagnostic_issue WHERE source='browser'")).rows);
    for (const secret of ["DO_NOT_STORE", "0123", "password", "private"]) expect(rows).not.toContain(secret);
  } finally { await pool.end(); }
  expect((await page.request.post("/api/diagnostics", { headers: { origin: "http://127.0.0.1:3100" }, data: { id: randomUUID(), kind: "browser_crash", path: "/admin", role: "admin" } })).status()).toBe(400);
});

test("an unavailable log store shows a diagnostic error instead of a false empty list and other admin functions remain usable", async ({ page }) => {
  await page.route("**/api/admin/logs?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Log store unavailable" }) }));
  await login(page);
  await expect(page.locator(".system-logs").getByRole("alert")).toContainText("The list could not be verified");
  await expect(page.getByRole("heading", { name: "No matching issues" })).toHaveCount(0);
  await page.getByRole("button", { name: "Owners", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Owner accounts", exact: true })).toBeVisible();
  await page.unroute("**/api/admin/logs?*");
  await page.getByRole("button", { name: "System logs", exact: true }).click();
  await expect(page.getByRole("button", { name: /A server request failed/ })).toBeVisible();
});
