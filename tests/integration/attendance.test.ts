import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { db, pool } from "../../src/db";
import { employee, attendance, device } from "../../src/db/schema";
import {
  pairDevice,
  revokeDevice,
  attendanceAction,
  posState,
  saveEmployee,
} from "../../src/modules/attendance";
import { GET, POST } from "../../src/app/api/pos/route";
let token: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query("TRUNCATE employee, device, throttle CASCADE");
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  await saveEmployee({ name: "Bima", pin: "4567", active: true });
  token = await pairDevice();
});
afterAll(async () => {
  await pool.end();
});
describe("attendance and device identity", () => {
  it("starts locked, supports concurrent employees, switches without changing shifts", async () => {
    expect((await posState(token)).cashier).toBeNull();
    await attendanceAction(token, "clock-in", "0123");
    await attendanceAction(token, "clock-in", "4567");
    const initial = await posState(token);
    expect(initial.shifts).toHaveLength(2);
    expect(initial.cashier?.name).toBe("Ayu");
    await attendanceAction(token, "switch", "4567");
    const switched = await posState(token);
    expect(switched.cashier?.name).toBe("Bima");
    expect(switched.shifts).toEqual(initial.shifts);
    await attendanceAction(token, "clock-out", "4567");
    expect((await posState(token)).cashier).toBeNull();
    await attendanceAction(token, "switch", "0123");
    await attendanceAction(token, "clock-out", "0123");
    expect((await posState(token)).shifts).toHaveLength(0);
    expect((await posState(token)).cashier).toBeNull();
  });
  it("serializes duplicate concurrent clock-in and clock-out", async () => {
    const starts = await Promise.allSettled([
      attendanceAction(token, "clock-in", "0123"),
      attendanceAction(token, "clock-in", "0123"),
    ]);
    expect(starts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(attendance)).toHaveLength(1);
    const ends = await Promise.allSettled([
      attendanceAction(token, "clock-out", "0123"),
      attendanceAction(token, "clock-out", "0123"),
    ]);
    expect(ends.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const [shift] = await db.select().from(attendance);
    expect(shift.clockOut).not.toBeNull();
    await expect(
      db
        .insert(attendance)
        .values({
          employeeId: shift.employeeId,
          clockIn: new Date(),
          clockOut: new Date(0),
        }),
    ).rejects.toThrow();
  });
  it("enforces database active-shift uniqueness independently of app locks", async () => {
    const [e] = await db.select().from(employee);
    await db.insert(attendance).values({ employeeId: e.id });
    await expect(
      db.insert(attendance).values({ employeeId: e.id }),
    ).rejects.toThrow();
  });
  it("denies absent/forged device cookies, spoofed identity, bad PIN, switch without shift", async () => {
    expect(
      (await GET(new Request("http://127.0.0.1:3100/api/pos"))).status,
    ).toBe(401);
    await expect(posState("0".repeat(64))).rejects.toThrow();
    await expect(attendanceAction(token, "clock-in", "9999")).rejects.toThrow(
      "PIN tidak cocok",
    );
    await expect(attendanceAction(token, "switch", "0123")).rejects.toThrow(
      "Mulai kerja",
    );
    const response = await POST(
      new Request("http://127.0.0.1:3100/api/pos", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3100",
          "content-type": "application/json",
          cookie: `lisi_device=${token}`,
        },
        body: JSON.stringify({
          action: "switch",
          pin: "0123",
          employeeId: "forged",
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("locks after 15 minutes without changing attendance; no idle extension after expiry", async () => {
    await attendanceAction(token, "clock-in", "0123");
    await db
      .update(device)
      .set({ touchedAt: new Date(Date.now() - 16 * 60000) });
    expect((await posState(token)).cashier).toBeNull();
    await expect(attendanceAction(token, "touch")).rejects.toThrow(
      "Kasir terkunci",
    );
    expect((await posState(token)).shifts).toHaveLength(1);
    await attendanceAction(token, "switch", "0123");
    expect((await posState(token)).cashier?.name).toBe("Ayu");
  });
  it("revokes old pairing and reset cashier credentials without deleting shifts", async () => {
    await attendanceAction(token, "clock-in", "0123");
    const [e] = await db
      .select()
      .from(employee)
      .where(eq(employee.name, "Ayu"));
    await saveEmployee({ id: e.id, name: e.name, pin: "2222", active: true });
    expect((await posState(token)).cashier).toBeNull();
    expect((await posState(token)).shifts).toHaveLength(1);
    await expect(attendanceAction(token, "switch", "0123")).rejects.toThrow();
    await attendanceAction(token, "switch", "2222");
    const replacement = await pairDevice();
    await expect(posState(token)).rejects.toThrow();
    expect((await posState(replacement)).shifts).toHaveLength(1);
    await revokeDevice();
    await expect(posState(replacement)).rejects.toThrow();
  });
  it("prevents duplicate PINs and deactivating a working employee", async () => {
    await expect(
      saveEmployee({ name: "C", pin: "0123", active: true }),
    ).rejects.toThrow("PIN sudah");
    await attendanceAction(token, "clock-in", "0123");
    const [e] = await db
      .select()
      .from(employee)
      .where(eq(employee.name, "Ayu"));
    await expect(
      saveEmployee({ id: e.id, name: e.name, active: false }),
    ).rejects.toThrow("Selesaikan shift");
  });
  it("persists failure throttle across connections and limits brute force", async () => {
    for (let i = 0; i < 10; i++)
      await expect(attendanceAction(token, "switch", "9999")).rejects.toThrow(
        "PIN tidak cocok",
      );
    await expect(attendanceAction(token, "clock-in", "0123")).rejects.toThrow(
      "Terlalu banyak",
    );
    const other = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const r = await other.query(
        "SELECT count FROM throttle WHERE key='pin-failures'",
      );
      expect(r.rows[0].count).toBe(11);
    } finally {
      await other.end();
    }
  });
  it("does not erase previous failures on successful PIN verification", async () => {
    await expect(attendanceAction(token, "clock-in", "9999")).rejects.toThrow();
    await attendanceAction(token, "clock-in", "0123");
    const r = await db.execute<{ count: number }>(
      sql`SELECT count FROM throttle WHERE key='pin-failures'`,
    );
    expect(r.rows[0].count).toBe(1);
  });
});
