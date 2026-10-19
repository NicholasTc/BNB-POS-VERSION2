import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { employee, attendance, device, audit, sale } from "@/db/schema";
import { AppError, limit } from "@/lib/http";
import { digest, pinLookup, verifyPin, hashPin } from "@/lib/credentials";
import { sessionFarewell } from "./orders/sessions";
import type { SessionFarewell } from "./orders/types";
export const DEVICE_COOKIE = "lisi_device";
export const IDLE_MS = 15 * 60 * 1000;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function deviceToken(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(DEVICE_COOKIE + "="))
    ?.slice(DEVICE_COOKIE.length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new AppError(401, "Perangkat belum terhubung. Hubungi pemilik.");
  return value;
}
export function cashierValid(d: typeof device.$inferSelect) {
  return (
    !!d.cashierId &&
    !!d.touchedAt &&
    Date.now() - d.touchedAt.getTime() < IDLE_MS
  );
}
export async function lockedDevice(tx: Transaction, token: string) {
  const [d] = await tx
    .select()
    .from(device)
    .where(eq(device.id, "shared"))
    .for("update");
  if (
    !d ||
    d.tokenHash !== digest(token) ||
    d.expiresAt.getTime() <= Date.now()
  )
    throw new AppError(401, "Perangkat belum terhubung. Hubungi pemilik.");
  return d;
}
export async function pairDevice() {
  const token = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(891102)`);
    await tx
      .insert(device)
      .values({
        id: "shared",
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      .onConflictDoUpdate({
        target: device.id,
        set: {
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 30 * 86400000),
          cashierId: null,
          touchedAt: null,
          generation: sql`${device.generation}+1`,
        },
      });
    await tx.insert(audit).values({ actor: "owner", action: "device.pair" });
  });
  return token;
}
export async function revokeDevice() {
  await db.transaction(async (tx) => {
    await tx
      .update(device)
      .set({
        tokenHash: null,
        cashierId: null,
        touchedAt: null,
        generation: sql`${device.generation}+1`,
      });
    await tx.insert(audit).values({ actor: "owner", action: "device.revoke" });
  });
}
async function authenticatePin(pin: string) {
  await limit("pin-attempts", 60, 60);
  // Reserve a failure slot before hashing; successful verification releases only
  // its own slot, never erasing earlier failures. Concurrent attempts are bounded.
  await limit("pin-failures", 10, 900);
  const [e] = await db
    .select()
    .from(employee)
    .where(
      and(eq(employee.pinLookup, pinLookup(pin)), eq(employee.active, true)),
    );
  const dummy = "00000000000000000000000000000000:" + "0".repeat(128);
  const valid = await verifyPin(pin, e?.pinHash ?? dummy);
  if (!e || !valid)
    throw new AppError(401, "PIN tidak cocok. Periksa lalu coba lagi.");
  await db.execute(
    sql`UPDATE throttle SET count=greatest(count-1,0) WHERE key='pin-failures'`,
  );
  return e;
}
export async function attendanceAction(
  token: string,
  action: "clock-in" | "switch" | "clock-out" | "lock" | "touch",
  pin?: string,
) {
  // Reject unpaired devices before consuming the shared PIN attempt budget.
  const [known] = await db
    .select()
    .from(device)
    .where(eq(device.tokenHash, digest(token)));
  if (!known || known.expiresAt.getTime() <= Date.now())
    throw new AppError(401, "Perangkat belum terhubung. Hubungi pemilik.");
  const authenticated =
    action === "lock" || action === "touch"
      ? null
      : await authenticatePin(pin ?? "");
  return db.transaction(async (tx) => {
    const d = await lockedDevice(tx, token);
    let farewell: SessionFarewell | null = null;
    if (action === "lock") {
      await tx
        .update(device)
        .set({ cashierId: null, touchedAt: null, generation: d.generation + 1 })
        .where(eq(device.id, "shared"));
      return;
    }
    if (action === "touch") {
      if (!cashierValid(d))
        throw new AppError(
          401,
          "Kasir terkunci. Masukkan PIN untuk melanjutkan.",
        );
      await tx
        .update(device)
        .set({ touchedAt: new Date() })
        .where(eq(device.id, "shared"));
      return;
    }
    const [e] = await tx
      .select()
      .from(employee)
      .where(eq(employee.id, authenticated!.id))
      .for("update");
    if (!e.active || e.pinHash !== authenticated!.pinHash)
      throw new AppError(401, "PIN telah berubah. Masukkan kembali PIN Anda.");
    const [pending] = await tx
      .select()
      .from(sale)
      .where(inArray(sale.status, ["pending", "paid"]));
    if (pending && !(action === "switch" && e.id === pending.cashierId))
      throw new AppError(
        409,
        `Periksa transaksi ${pending.cashierName} terlebih dahulu. Hanya kasir tersebut yang dapat melanjutkan.`,
      );
    const [shift] = await tx
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, e.id), isNull(attendance.clockOut)));
    if (action === "clock-in") {
      if (shift)
        throw new AppError(409, "Anda sudah mulai kerja. Gunakan Ganti kasir.");
      await tx.insert(attendance).values({ employeeId: e.id });
      if (!cashierValid(d))
        await tx
          .update(device)
          .set({
            cashierId: e.id,
            touchedAt: new Date(),
            generation: d.generation + 1,
          })
          .where(eq(device.id, "shared"));
    } else if (action === "switch") {
      if (!shift)
        throw new AppError(
          409,
          "Mulai kerja terlebih dahulu sebelum menjadi kasir.",
        );
      await tx
        .update(device)
        .set({
          cashierId: e.id,
          touchedAt: new Date(),
          generation: d.generation + 1,
        })
        .where(eq(device.id, "shared"));
    } else {
      if (!shift) throw new AppError(409, "Anda belum mulai kerja.");
      await tx
        .update(attendance)
        .set({ clockOut: new Date() })
        .where(eq(attendance.id, shift.id));
      farewell = await sessionFarewell(tx, shift.id);
      if (d.cashierId === e.id)
        await tx
          .update(device)
          .set({
            cashierId: null,
            touchedAt: null,
            generation: d.generation + 1,
          })
          .where(eq(device.id, "shared"));
    }
    await tx
      .insert(audit)
      .values({ actor: e.id, action: "attendance." + action });
    return farewell;
  });
}
export async function posState(token: string) {
  return db.transaction(async (tx) => {
    const d = await lockedDevice(tx, token);
    const shifts = await tx
      .select({
        id: attendance.id,
        employeeId: employee.id,
        name: employee.name,
        clockIn: attendance.clockIn,
      })
      .from(attendance)
      .innerJoin(employee, eq(attendance.employeeId, employee.id))
      .where(isNull(attendance.clockOut));
    const cashier = cashierValid(d)
      ? (shifts.find((s) => s.employeeId === d.cashierId) ?? null)
      : null;
    return {
      paired: true as const,
      shifts,
      cashier,
      generation: d.generation,
      expiresAt: cashier
        ? new Date(d.touchedAt!.getTime() + IDLE_MS).toISOString()
        : null,
    };
  });
}
export async function saveEmployee(input: {
  id?: string;
  name: string;
  pin?: string;
  active: boolean;
}) {
  const pinHash = input.pin ? await hashPin(input.pin) : undefined;
  try {
    await db.transaction(async (tx) => {
      // Same lock order as employee actions: device first, then employee.
      await tx.select().from(device).for("update");
      if (input.id) {
        const [e] = await tx
          .select()
          .from(employee)
          .where(eq(employee.id, input.id))
          .for("update");
        if (!e) throw new AppError(404, "Karyawan tidak ditemukan.");
        if (!input.active) {
          const [shift] = await tx
            .select()
            .from(attendance)
            .where(
              and(eq(attendance.employeeId, e.id), isNull(attendance.clockOut)),
            );
          if (shift)
            throw new AppError(
              409,
              "Selesaikan shift sebelum menonaktifkan karyawan.",
            );
        }
        await tx
          .update(employee)
          .set({
            name: input.name,
            active: input.active,
            ...(pinHash ? { pinHash, pinLookup: pinLookup(input.pin!) } : {}),
          })
          .where(eq(employee.id, e.id));
        if (pinHash || !input.active)
          await tx
            .update(device)
            .set({
              cashierId: null,
              touchedAt: null,
              generation: sql`${device.generation}+1`,
            })
            .where(eq(device.cashierId, e.id));
      } else {
        if (!pinHash) throw new AppError(400, "Masukkan PIN empat angka.");
        await tx
          .insert(employee)
          .values({
            name: input.name,
            pinHash,
            pinLookup: pinLookup(input.pin!),
            active: input.active,
          });
      }
      await tx
        .insert(audit)
        .values({
          actor: "owner",
          action: input.id ? "employee.update" : "employee.create",
          details: { employeeId: input.id ?? null, pinReset: !!pinHash },
        });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "23505")
      throw new AppError(409, "PIN sudah digunakan. Pilih PIN lain.");
    throw error;
  }
}
