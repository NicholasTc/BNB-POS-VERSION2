import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../src/db";
import { menuItem } from "../../src/db/schema";
import {
  pairDevice,
  attendanceAction,
  posState,
  saveEmployee,
} from "../../src/modules/attendance";
import { prepareSale, changeSale } from "../../src/modules/sales";
import { report } from "../../src/modules/reporting";
import { businessToday } from "../../src/lib/dates";
import { POST as login } from "../../src/app/api/auth/[...all]/route";
import {
  GET as employeesGet,
  POST as employeesPost,
} from "../../src/app/api/owner/employees/route";
import {
  GET as menuGet,
  POST as menuPost,
} from "../../src/app/api/owner/menu/route";
import { POST as pair } from "../../src/app/api/owner/device/route";
import { limitedText } from "../../src/lib/http";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query("TRUNCATE employee,device,menu_item,throttle CASCADE");
});
afterAll(async () => {
  await pool.end();
});
describe("security hardening", () => {
  it("denies every owner management operation to anonymous callers", async () => {
    for (const fn of [employeesGet, menuGet])
      expect(
        (await fn(new Request("http://127.0.0.1:3100/api/owner"))).status,
      ).toBe(401);
    for (const fn of [employeesPost, menuPost, pair])
      expect(
        (
          await fn(
            new Request("http://127.0.0.1:3100/api/owner", {
              method: "POST",
              headers: {
                origin: "http://127.0.0.1:3100",
                "content-type": "application/json",
              },
              body: "{}",
            }),
          )
        ).status,
      ).toBe(401);
  });
  it("bounds chunked bodies before full buffering, including owner auth", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(17000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(
      "http://127.0.0.1:3100/api/auth/sign-in/email",
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3100",
          "content-type": "application/json",
        },
        body: stream,
        duplex: "half",
      } as RequestInit,
    );
    expect((await login(request)).status).toBe(413);
    expect(cancelled).toBe(true);
    await expect(
      limitedText(
        new Request("http://local", {
          method: "POST",
          body: "x",
          headers: { "content-length": "17000" },
        }),
      ),
    ).rejects.toThrow("terlalu besar");
  });
  it("does not permit a second open quote under concurrent different keys", async () => {
    await saveEmployee({ name: "Ayu", pin: "0123", active: true });
    const token = await pairDevice();
    await attendanceAction(token, "clock-in", "0123");
    const [item] = await db
      .insert(menuItem)
      .values({ name: "Kopi", price: 18000 })
      .returning();
    const generation = (await posState(token)).generation;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        prepareSale(token, {
          id: randomUUID(),
          generation,
          paymentMethod: "cash",
          items: [{ id: item.id, unitPrice: 18000, quantity: 1 }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
it("measures a 1000-sale café fixture and real checkout latency", async () => {
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  const token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  await db.insert(menuItem).values({ name: "Kopi", price: 18000 });
  await pool.query(
    `DO $$ DECLARE n integer; sid uuid; eid uuid; mid uuid; BEGIN SELECT id INTO eid FROM employee LIMIT 1; SELECT id INTO mid FROM menu_item LIMIT 1; FOR n IN 1..1000 LOOP sid:=gen_random_uuid(); INSERT INTO sale (id,reference,device_id,cashier_id,cashier_name,request_hash,payment_method,total) VALUES (sid,'LS-'||sid,'shared',eid,'Ayu',sid::text,'cash',18000); INSERT INTO sale_line (sale_id,menu_item_id,name,unit_price,quantity,subtotal) VALUES (sid,mid,'Kopi',18000,1,18000); UPDATE sale SET status='paid',attested_at=now() WHERE id=sid; UPDATE sale SET status='completed',completed_at=now() WHERE id=sid; END LOOP; END $$`,
  );
  const pos: number[] = [],
    reports: number[] = [],
    checkouts: number[] = [];
  const [item] = await db.select().from(menuItem);
  const generation = (await posState(token)).generation;
  for (let i = 0; i < 10; i++) {
    let t = performance.now();
    await posState(token);
    pos.push(performance.now() - t);
    t = performance.now();
    const r = await report({
      from: businessToday(),
      to: businessToday(),
      salesPage: 1,
      attendancePage: 1,
    });
    reports.push(performance.now() - t);
    expect(r.summary.salesCount).toBe(1000 + i);
    const id = randomUUID();
    t = performance.now();
    await prepareSale(token, {
      id,
      generation,
      paymentMethod: "qris",
      items: [{ id: item.id, quantity: 1, unitPrice: 18000 }],
    });
    await changeSale(token, { id, action: "attest", paymentReceived: true });
    await changeSale(token, { id, action: "complete" });
    checkouts.push(performance.now() - t);
  }
  const p95 = (v: number[]) =>
    Math.ceil([...v].sort((a, b) => a - b)[Math.ceil(v.length * 0.95) - 1]);
  const metrics = {
    fixtureSales: 1000,
    samples: 10,
    posP95ms: p95(pos),
    reportP95ms: p95(reports),
    quoteAttestCompleteP95ms: p95(checkouts),
  };
  mkdirSync(".verification", { recursive: true });
  writeFileSync(
    ".verification/performance.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(JSON.stringify({ localPerformance: metrics }));
  expect(metrics.posP95ms).toBeLessThan(1000);
  expect(metrics.reportP95ms).toBeLessThan(1000);
  expect(metrics.quoteAttestCompleteP95ms).toBeLessThan(1000);
});
