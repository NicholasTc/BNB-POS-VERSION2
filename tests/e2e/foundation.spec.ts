import { test, expect } from "@playwright/test";
test("locked POS and owner sign in/out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Selamat datang di BnB." })).toBeVisible();
  await page.getByRole("link", { name: "Masuk sebagai pemilik", exact: true }).click();
  await page.getByLabel("Email pemilik", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi", { exact: true }).fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk ke dasbor", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Navigasi pemilik" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Navigasi pemilik" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Masuk ke dasbor", exact: true }),
  ).toBeVisible();
});
