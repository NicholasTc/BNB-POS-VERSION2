import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, pool } from "../../src/db";
import {
  employee,
  menuItem,
  sale,
  saleLine,
  device,
} from "../../src/db/schema";
import {
  pairDevice,
  attendanceAction,
  posState,
  saveEmployee,
} from "../../src/modules/attendance";
import {
  prepareSale,
  changeSale,
  getSale,
  saveMenu,
  type PrepareSale,
} from "../../src/modules/sales";
import { POST } from "../../src/app/api/sales/route";
let token: string, input: PrepareSale;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query("TRUNCATE employee, device, menu_item, throttle CASCADE");
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  await saveEmployee({ name: "Bima", pin: "4567", active: true });
  token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  const [item] = await db
    .insert(menuItem)
    .values({ name: "Kopi susu", price: 18000 })
    .returning();
  input = {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "qris",
    items: [{ id: item.id, quantity: 2, unitPrice: 18000 }],
  };
});
afterAll(async () => {
  await pool.end();
});
const prepare = () => prepareSale(token, input);
const attest = () =>
  changeSale(token, { id: input.id, action: "attest", paymentReceived: true });
const complete = () => changeSale(token, { id: input.id, action: "complete" });
describe("durable paid sale", () => {
  it("snapshots authoritative prices/names and cashier; survives menu changes", async () => {
    const q = await prepare();
    expect(q.total).toBe(36000);
    expect(q.cashierName).toBe("Ayu");
    await saveMenu({
      id: input.items[0].id,
      name: "New name",
      price: 25000,
      active: false,
    });
    await attest();
    const result = await complete();
    expect(result.status).toBe("completed");
    expect(result.lines[0]).toMatchObject({
      name: "Kopi susu",
      unitPrice: 18000,
      subtotal: 36000,
      quantity: 2,
    });
    expect(result.cashierId).toBe(
      (await db.select().from(employee).where(eq(employee.name, "Ayu")))[0].id,
    );
  });
  it("is idempotent for parallel prepare, attestation and finalization", async () => {
    const prepared = await Promise.all([prepare(), prepare(), prepare()]);
    expect(new Set(prepared.map((s) => s.id)).size).toBe(1);
    await Promise.all([attest(), attest()]);
    const results = await Promise.all(Array.from({ length: 8 }, complete));
    expect(new Set(results.map((s) => s.reference)).size).toBe(1);
    expect(await db.select().from(sale)).toHaveLength(1);
    expect(await db.select().from(saleLine)).toHaveLength(1);
  });
  it("rejects reused keys with different payload or payment method", async () => {
    await prepare();
    await expect(
      prepareSale(token, { ...input, paymentMethod: "cash" }),
    ).rejects.toThrow("Referensi sudah");
    await expect(
      prepareSale(token, {
        ...input,
        items: [{ ...input.items[0], quantity: 1 }],
      }),
    ).rejects.toThrow("Referensi sudah");
  });
  it("requires explicit payment attestation before completion", async () => {
    await prepare();
    await expect(complete()).rejects.toThrow("penerimaan pembayaran");
    await expect(
      changeSale(token, { id: input.id, action: "attest" }),
    ).rejects.toThrow("Pastikan");
    expect((await getSale(token, input.id))?.status).toBe("pending");
  });
  it("prevents cancellation of paid/completed and all snapshot tampering", async () => {
    await prepare();
    await attest();
    await expect(
      changeSale(token, {
        id: input.id,
        action: "cancel",
        paymentNotReceived: true,
      }),
    ).rejects.toThrow();
    await complete();
    await expect(
      db.update(sale).set({ total: 1 }).where(eq(sale.id, input.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(sale).where(eq(sale.id, input.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(saleLine)
        .set({ name: "Tampered" })
        .where(eq(saleLine.saleId, input.id)),
    ).rejects.toThrow();
  });
  it("allows explicit cancellation only before payment, then a new quote", async () => {
    await prepare();
    await expect(
      changeSale(token, { id: input.id, action: "cancel" }),
    ).rejects.toThrow();
    await changeSale(token, {
      id: input.id,
      action: "cancel",
      paymentNotReceived: true,
    });
    expect(await getSale(token)).toBeNull();
    const next = await prepareSale(token, { ...input, id: randomUUID() });
    expect(next.status).toBe("pending");
  });
  it("blocks stale prices, duplicate products, disabled items and stale cashier generation", async () => {
    await expect(
      prepareSale(token, {
        ...input,
        items: [{ ...input.items[0], unitPrice: 1 }],
      }),
    ).rejects.toThrow("harga berubah");
    await expect(
      prepareSale(token, { ...input, items: [...input.items, ...input.items] }),
    ).rejects.toThrow("tidak boleh diulang");
    await attendanceAction(token, "clock-in", "4567");
    await attendanceAction(token, "switch", "4567");
    await expect(prepare()).rejects.toThrow("Kasir berubah");
    await saveMenu({
      id: input.items[0].id,
      name: "Kopi",
      price: 18000,
      active: false,
    });
    await expect(
      prepareSale(token, {
        ...input,
        generation: (await posState(token)).generation,
      }),
    ).rejects.toThrow("Menu atau harga berubah");
  });
  it("blocks identity changes for unfinished sales but allows same-cashier PIN recovery", async () => {
    await attendanceAction(token, "clock-in", "4567");
    await prepare();
    await expect(attendanceAction(token, "switch", "4567")).rejects.toThrow(
      "Periksa transaksi",
    );
    await expect(attendanceAction(token, "clock-out", "0123")).rejects.toThrow(
      "Periksa transaksi",
    );
    await attendanceAction(token, "lock");
    await expect(attest()).rejects.toThrow("Kasir terkunci");
    await attendanceAction(token, "switch", "0123");
    await attest();
    await complete();
  });
  it("returns a committed result after lost response even when cashier expired", async () => {
    await prepare();
    await attest();
    const committed = await complete();
    await db.update(device).set({ touchedAt: new Date(0) });
    expect((await getSale(token, input.id))?.reference).toBe(
      committed.reference,
    );
    expect((await complete()).reference).toBe(committed.reference);
  });
  it("rolls back completion on database failure and safely retries once", async () => {
    await prepare();
    await attest();
    await pool.query(
      "CREATE FUNCTION test_fail_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'injected test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail_complete BEFORE UPDATE ON sale FOR EACH ROW EXECUTE FUNCTION test_fail_complete()",
    );
    try {
      await expect(complete()).rejects.toThrow();
      expect((await getSale(token, input.id))?.status).toBe("paid");
    } finally {
      await pool.query(
        "DROP TRIGGER test_fail_complete ON sale; DROP FUNCTION test_fail_complete()",
      );
    }
    expect((await complete()).status).toBe("completed");
    expect(await db.select().from(sale)).toHaveLength(1);
  });
  it("rejects inconsistent aggregates at commit and persists nothing", async () => {
    const [e] = await db.select().from(employee);
    const id = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(sale)
          .values({
            id,
            reference: id,
            deviceId: "shared",
            cashierId: e.id,
            cashierName: e.name,
            requestHash: "x",
            paymentMethod: "cash",
            total: 100,
          });
      }),
    ).rejects.toThrow();
    expect(await db.select().from(sale).where(eq(sale.id, id))).toHaveLength(0);
  });
  it("denies anonymous sale creation, cross-site requests and spoofed cashier", async () => {
    const request = (
      payload: unknown,
      cookie = "",
      origin = "http://127.0.0.1:3100",
    ) =>
      new Request("http://127.0.0.1:3100/api/sales", {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    expect((await POST(request({ action: "prepare", ...input }))).status).toBe(
      401,
    );
    expect(
      (
        await POST(
          request(
            { action: "prepare", ...input },
            `lisi_device=${token}`,
            "https://evil.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request(
            { action: "prepare", ...input, cashierId: randomUUID() },
            `lisi_device=${token}`,
          ),
        )
      ).status,
    ).toBe(400);
  });
});
