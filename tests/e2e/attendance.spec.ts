import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { login, pin } from "./helpers";
test("pair, provision, concurrent shifts, switch, refresh, process restart and lock", async ({
  page,
}) => {
  await login(page);
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await expect(
    page.getByText("Perangkat terhubung selama 30 hari.", { exact: false }),
  ).toBeVisible();
  for (const [name, code] of [
    ["Ayu", "0123"],
    ["Bima", "4567"],
  ]) {
    await page.getByLabel("Nama karyawan", { exact: true }).fill(name);
    await page.getByLabel("PIN empat angka", { exact: true }).fill(code);
    await page
      .getByRole("button", { name: "Simpan karyawan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Ubah ${name}`, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Kasir", exact: true }).click();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await expect(page.getByText("Kasir: Ayu", { exact: true })).toBeVisible();
  await pin(page, "Mulai kerja", "4567", "Mulai kerja");
  await pin(page, "Ganti kasir", "4567", "Jadi kasir");
  await page.reload();
  await expect(page.getByText("Kasir: Bima", { exact: true })).toBeVisible();
  // A fresh application process must read the same durable identity/attendance.
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3101",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        BETTER_AUTH_URL: "http://127.0.0.1:3101",
      },
      stdio: "ignore",
    },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (
              await page.request.get("http://127.0.0.1:3101/api/pos")
            ).status();
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
    const state = await (
      await page.request.get("http://127.0.0.1:3101/api/pos")
    ).json();
    expect(state.shifts).toHaveLength(2);
    expect(state.cashier.name).toBe("Bima");
  } finally {
    server.kill("SIGTERM");
  }
  await pin(page, "Selesai kerja", "4567", "Selesai kerja");
  await expect(
    page.getByText("Kasir: Bima", { exact: true }),
  ).not.toBeVisible();
  await pin(page, "Ganti kasir", "0123", "Jadi kasir");
  await pin(page, "Selesai kerja", "0123", "Selesai kerja");
  await expect(
    page.getByText("Belum ada yang mulai kerja.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/attendance-tablet.png",
    fullPage: true,
  });
});
