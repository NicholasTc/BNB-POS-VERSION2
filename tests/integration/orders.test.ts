import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../src/db";
import { menuItem } from "../../src/db/schema";
import {
  attendanceAction,
  pairDevice,
  posState,
  revokeDevice,
  saveEmployee,
} from "../../src/modules/attendance";
import { prepareSale, changeSale } from "../../src/modules/sales";
import {
  readOrders,
  finishOrder,
  ORDER_PAGE_SIZE,
} from "../../src/modules/orders/server";
import { GET, POST } from "../../src/app/api/orders/route";
let token: string, product: { id: string; price: number };
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query("TRUNCATE employee,device,menu_item,throttle CASCADE");
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  await saveEmployee({ name: "Bima", pin: "4567", active: true });
  token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  [product] = await db
    .insert(menuItem)
    .values({ name: "Juice A", price: 20000 })
    .returning();
});
afterAll(async () => {
  await pool.end();
});
async function prepare(quantity = 2) {
  const input = {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "cash" as const,
    items: [{ id: product.id, unitPrice: product.price, quantity }],
  };
  await prepareSale(token, input);
  return input.id;
}
async function complete(id?: string) {
  id ??= await prepare();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await changeSale(token, { id, action: "complete" });
  return id;
}
async function generation() {
  return (await posState(token)).generation;
}
const request = (
  method = "GET",
  payload?: unknown,
  cookie?: string,
  origin = "http://127.0.0.1:3100",
) =>
  new Request("http://127.0.0.1:3100/api/orders", {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
it("captures only completed sales once, with immutable items and original cashier", async () => {
  const id = await prepare(3);
  expect((await readOrders(token)).pending.total).toBe(0);
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  expect((await readOrders(token)).pending.total).toBe(0);
  await changeSale(token, { id, action: "complete" });
  await changeSale(token, { id, action: "complete" });
  await pool.query("UPDATE menu_item SET name='Renamed',price=40000");
  const board = await readOrders(token);
  expect(board.pending.total).toBe(1);
  expect(board.pending.orders[0]).toMatchObject({
    id,
    cashierName: "Ayu",
    carriedOver: false,
    lines: [{ name: "Juice A", quantity: 3 }],
  });
  expect(board.finished.total).toBe(0);
});
it("finishes idempotently under concurrency without changing sale, attendance or spreadsheet jobs", async () => {
  const id = await complete(),
    g = await generation();
  const snapshot = async () =>
    JSON.stringify(
      (
        await pool.query(
          `SELECT (SELECT jsonb_agg(to_jsonb(s)) FROM sale s) AS sales,(SELECT jsonb_agg(to_jsonb(l)) FROM sale_line l) AS lines,(SELECT jsonb_agg(to_jsonb(a)) FROM attendance a) AS shifts,(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM sheets_sync_job j) AS jobs`,
        )
      ).rows[0],
    );
  const before = await snapshot();
  await Promise.all([finishOrder(token, id, g), finishOrder(token, id, g)]);
  const board = await readOrders(token);
  expect(board.pending.total).toBe(0);
  expect(board.finished.orders[0]).toMatchObject({ id, finishedByName: "Ayu" });
  expect(await snapshot()).toBe(before);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit WHERE action='order.finish' AND details->>'saleId'=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it("shares a session across staff, cashier switches, midnight and re-pairing; final clock-out includes every participant", async () => {
  await attendanceAction(token, "clock-in", "4567");
  const initial = await readOrders(token);
  await pool.query(
    "UPDATE work_session SET opened_at=opened_at-interval '2 days'",
  );
  await complete();
  expect(await attendanceAction(token, "clock-out", "0123")).toBeNull();
  await attendanceAction(token, "switch", "4567");
  await complete();
  expect((await readOrders(token)).session.id).toBe(initial.session.id);
  token = await pairDevice();
  await attendanceAction(token, "switch", "4567");
  expect((await readOrders(token)).session.id).toBe(initial.session.id);
  const farewell = await attendanceAction(token, "clock-out", "4567");
  expect(farewell).toMatchObject({
    id: initial.session.id,
    names: ["Ayu", "Bima"],
    productsSold: 4,
    ordersSold: 2,
    pendingOrders: 2,
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_session WHERE closed_at IS NULL",
      )
    ).rows[0].n,
  ).toBe(0);
  expect((await posState(token)).cashier).toBeNull();
});
it("carries pending orders into the next session and keeps finished history scoped to the session of preparation", async () => {
  const oldDone = await complete();
  await finishOrder(token, oldDone, await generation());
  const carried = await complete();
  const oldSession = (await readOrders(token)).session.id;
  const farewell = await attendanceAction(token, "clock-out", "0123");
  expect(farewell?.pendingOrders).toBe(1);
  await attendanceAction(token, "clock-in", "4567");
  let board = await readOrders(token);
  expect(board.session.id).not.toBe(oldSession);
  expect(board.finished.total).toBe(0);
  expect(board.pending.orders[0]).toMatchObject({
    id: carried,
    carriedOver: true,
  });
  await finishOrder(token, carried, await generation());
  board = await readOrders(token);
  expect(board.finished.orders.map((o) => o.id)).toEqual([carried]);
  expect(await attendanceAction(token, "clock-out", "4567")).toMatchObject({
    names: ["Bima"],
    productsSold: 0,
    ordersSold: 0,
    pendingOrders: 0,
  });
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM order_ticket")).rows[0].n,
  ).toBe(2);
});
it("denies anonymous, forged, locked, expired and revoked devices; rejects identity spoofing, bad origins and stale generations", async () => {
  const id = await complete(),
    g = await generation(),
    cookie = `lisi_device=${token}`;
  expect((await GET(request())).status).toBe(401);
  expect(
    (await GET(request("GET", undefined, `lisi_device=${"0".repeat(64)}`)))
      .status,
  ).toBe(401);
  expect(
    (
      await POST(
        request(
          "POST",
          { id, generation: g, employeeId: randomUUID() },
          cookie,
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request("POST", { id, generation: g }, cookie, "https://evil.example"),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(request("POST", { id, generation: g + 1 }, cookie))).status,
  ).toBe(409);
  await attendanceAction(token, "lock");
  expect((await GET(request("GET", undefined, cookie))).status).toBe(401);
  expect(
    (await POST(request("POST", { id, generation: g }, cookie))).status,
  ).toBe(401);
  await attendanceAction(token, "switch", "0123");
  await pool.query("UPDATE device SET touched_at=now()-interval '16 minutes'");
  expect((await GET(request("GET", undefined, cookie))).status).toBe(401);
  await attendanceAction(token, "switch", "0123");
  await pool.query("UPDATE device SET expires_at=now()-interval '1 minute'");
  expect((await GET(request("GET", undefined, cookie))).status).toBe(401);
  token = await pairDevice();
  await revokeDevice();
  expect(
    (await GET(request("GET", undefined, `lisi_device=${token}`))).status,
  ).toBe(401);
  expect(
    (
      await pool.query(
        "SELECT finished_at FROM order_ticket WHERE sale_id=$1",
        [id],
      )
    ).rows[0].finished_at,
  ).toBeNull();
});
it("uses bounded cursor pages with stable tie-breakers and rejects malformed or foreign cursors", async () => {
  const ids: string[] = [];
  for (let i = 0; i < ORDER_PAGE_SIZE + 2; i++) ids.push(await complete());
  await pool.query(
    "UPDATE order_ticket SET received_at=(SELECT min(received_at) FROM order_ticket)",
  );
  const first = await readOrders(token);
  expect(first.pending.orders).toHaveLength(ORDER_PAGE_SIZE);
  const second = await readOrders(token, {
    pendingAfter: first.pending.nextCursor!,
  });
  expect(second.pending.orders).toHaveLength(2);
  expect(
    new Set(
      [...first.pending.orders, ...second.pending.orders].map((o) => o.id),
    ).size,
  ).toBe(ids.length);
  await Promise.all(
    ids.map(async (id) => finishOrder(token, id, await generation())),
  );
  const finished = await readOrders(token);
  const last = await readOrders(token, {
    finishedBefore: finished.finished.nextCursor!,
  });
  expect(finished.finished.orders.length + last.finished.orders.length).toBe(
    ids.length,
  );
  await expect(
    readOrders(token, { pendingAfter: randomUUID() }),
  ).rejects.toThrow("Daftar pesanan berubah");
  expect(
    (
      await GET(
        new Request("http://127.0.0.1:3100/api/orders?pendingAfter=bad", {
          headers: { cookie: `lisi_device=${token}` },
        }),
      )
    ).status,
  ).toBe(400);
});
it("rolls session capture back with attendance and order capture back with completion", async () => {
  const id = await prepare();
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await pool.query(
    `CREATE FUNCTION reject_order_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$; CREATE TRIGGER reject_order_test BEFORE INSERT ON order_ticket FOR EACH ROW EXECUTE FUNCTION reject_order_test()`,
  );
  try {
    await expect(
      changeSale(token, { id, action: "complete" }),
    ).rejects.toThrow();
  } finally {
    await pool.query(
      "DROP TRIGGER reject_order_test ON order_ticket; DROP FUNCTION reject_order_test()",
    );
  }
  expect(
    (await pool.query("SELECT status FROM sale WHERE id=$1", [id])).rows[0]
      .status,
  ).toBe("paid");
  await changeSale(token, { id, action: "complete" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE attendance SET clock_out=now()");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  expect(
    (await pool.query("SELECT closed_at FROM work_session")).rows[0].closed_at,
  ).toBeNull();
});

it("keeps the session consistent when different employees clock out concurrently", async () => {
  await attendanceAction(token, "clock-in", "4567");
  await complete();
  const results = await Promise.all([
    attendanceAction(token, "clock-out", "0123"),
    attendanceAction(token, "clock-out", "4567"),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(results.find(Boolean)).toMatchObject({
    names: ["Ayu", "Bima"],
    productsSold: 2,
    ordersSold: 1,
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM work_session WHERE closed_at IS NOT NULL",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("handles small app/database clock differences without losing or blocking an order", async () => {
  await pool.query(
    "UPDATE work_session SET opened_at=clock_timestamp()+interval '1 second'",
  );
  const id = await complete();
  expect((await readOrders(token)).pending.orders[0].id).toBe(id);
  await pool.query(
    "UPDATE order_ticket SET received_at=clock_timestamp()+interval '1 second'",
  );
  await finishOrder(token, id, await generation());
  expect(
    (
      await pool.query(
        "SELECT finished_at>=received_at AS valid FROM order_ticket WHERE sale_id=$1",
        [id],
      )
    ).rows[0].valid,
  ).toBe(true);
});
it("passive reads do not extend cashier access and responses cannot be cached", async () => {
  const before = (await pool.query("SELECT touched_at FROM device")).rows[0]
    .touched_at;
  const response = await GET(request("GET", undefined, `lisi_device=${token}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    (await pool.query("SELECT touched_at FROM device")).rows[0].touched_at,
  ).toEqual(before);
});
