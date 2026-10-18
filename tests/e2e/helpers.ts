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
  await staffAction(page, action);
  await page.getByLabel("PIN karyawan", { exact: true }).fill(value);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: submit, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

export async function staffAction(page: Page, action: string) {
  const button = page
    .getByRole("button", { name: action, exact: true })
    .first();
  if (!(await button.isVisible()))
    await page.getByRole("button", { name: "Staf", exact: true }).click();
  await button.click();
}
export async function openPayment(
  page: Page,
  method: "Tunai" | "QRIS" = "QRIS",
) {
  await page.getByRole("button", { name: method, exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: method, exact: true }),
  ).toBeVisible();
}
export async function confirmPayment(page: Page) {
  const dialog = page.getByRole("dialog");
  const cash = dialog.getByLabel("Uang diterima", { exact: true });
  if (await cash.isVisible())
    await dialog.getByRole("button", { name: "Uang pas", exact: true }).click();
  else await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: /^(Uang|Pembayaran) diterima · Simpan$/ })
    .click();
}
