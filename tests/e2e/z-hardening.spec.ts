import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { createServer, connect, type Socket } from "node:net";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { hashPin, pinLookup } from "../../src/lib/credentials";
import {
  ownerSection,
  login,
  pin,
  openPayment,
  confirmPayment,
} from "./helpers";
test.beforeEach(async () => {
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
    await pool.query(
      "INSERT INTO employee (name,pin_hash,pin_lookup) VALUES ('Ayu',$1,$2)",
      [await hashPin("0123"), pinLookup("0123")],
    );
    await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Kopi susu',18000),('Croissant',22000),('Teh lemon',15000)",
    );
  } finally {
    await pool.end();
  }
});
async function start(page: Page) {
  await login(page);
  await ownerSection(page, "settings", "device");
  page.on("dialog", (d) => void d.accept());
  await page
    .getByRole("button", { name: "Hubungkan perangkat ini", exact: true })
    .click();
  await expect(
    page.getByText("Perangkat terhubung selama 30 hari.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kasir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
}
test("mobile checkout, keyboard PIN focus trap and owner handoff revocation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect((await page.request.get("/api/owner")).status()).toBe(401);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByLabel("PIN karyawan", { exact: true }).focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("dialog[open]"),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const targets = await page
    .locator("main button:visible")
    .evaluateAll((buttons) =>
      buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    );
  expect(targets.every((t) => t.width >= 44 && t.height >= 44)).toBe(true);
  await page.screenshot({
    path: "test-results/pos-mobile.png",
    fullPage: true,
  });
  await openPayment(page);
  await confirmPayment(page);
  await expect(
    page.getByRole("heading", { name: "Penjualan tersimpan!" }),
  ).toBeVisible();
});
test("real PostgreSQL connection outage preserves paid sale and recovers once", async ({
  page,
}) => {
  test.setTimeout(45000);
  await start(page);
  await pin(page, "Mulai kerja", "0123", "Mulai kerja");
  await page
    .getByRole("button", { name: "Tambah Kopi susu", exact: true })
    .click();
  await openPayment(page);
  await page.route("**/api/sales", (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "complete"
    )
      return route.abort("failed");
    return route.continue();
  });
  await confirmPayment(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Belum terkonfirmasi",
  );
  await page.unroute("**/api/sales");
  const sockets = new Set<Socket>();
  const upstream = new URL(process.env.TEST_DATABASE_URL!);
  const proxy = createServer((client) => {
    const remote = connect({
      host: upstream.hostname,
      port: Number(upstream.port),
    });
    for (const s of [client, remote]) {
      sockets.add(s);
      s.on("error", () => {
        client.destroy();
        remote.destroy();
      });
      s.on("close", () => sockets.delete(s));
    }
    client.pipe(remote);
    remote.pipe(client);
  });
  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(port, "127.0.0.1", () => {
        proxy.removeListener("error", reject);
        resolve();
      });
    });
  await listen(0);
  const port = (proxy.address() as AddressInfo).port;
  const database = new URL(upstream);
  database.port = String(port);
  const app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: database.toString(),
        BETTER_AUTH_URL: "http://127.0.0.1:3102",
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
              await page.request.get("http://127.0.0.1:3102/api/pos")
            ).status();
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
    await page.goto("http://127.0.0.1:3102");
    await expect(
      page.getByRole("button", {
        name: "Pembayaran diterima · Simpan",
        exact: true,
      }),
    ).toBeEnabled();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await page
      .getByRole("button", {
        name: "Pembayaran diterima · Simpan",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Belum terkonfirmasi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Penjualan tersimpan!" }),
    ).not.toBeVisible();
    await listen(port);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Periksa status transaksi", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Pembayaran diterima · Simpan",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Pembayaran diterima · Simpan",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Penjualan tersimpan!" }),
    ).toBeVisible();
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      const r = await pool.query(
        "SELECT count(*)::int AS n,sum(total)::int AS total FROM sale WHERE status='completed'",
      );
      expect(r.rows[0]).toEqual({ n: 1, total: 18000 });
    } finally {
      await pool.end();
    }
  } finally {
    if (app.exitCode === null) {
      app.kill("SIGTERM");
      await new Promise((resolve) => app.once("exit", resolve));
    }
    for (const socket of sockets) socket.destroy();
    if (proxy.listening)
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
