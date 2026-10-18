import { test, expect } from "@playwright/test";
test("locked POS and owner sign in/out", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Siap menyambut hari?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Staf", exact: true }).click();
  await page.getByRole("link", { name: "Pemilik", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi").fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Navigasi pemilik" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Navigasi pemilik" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
});
