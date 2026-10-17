import { expect, type Page } from "@playwright/test";
export async function login(page: Page) {
  await page.goto("/owner");
  await page.getByLabel("Email", { exact: true }).fill("owner@test.local");
  await page.getByLabel("Kata sandi").fill("test-owner-password-2026");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Halo, Pemilik." }),
  ).toBeVisible();
}
export async function pin(
  page: Page,
  action: string,
  value: string,
  submit: string,
) {
  await page.getByRole("button", { name: action, exact: true }).click();
  await page.getByLabel("PIN karyawan", { exact: true }).fill(value);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: submit, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
