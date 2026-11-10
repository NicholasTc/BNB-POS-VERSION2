import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../src/db";
import { menuItem } from "../../src/db/schema";
import {
  saveEmployee,
  pairDevice,
  attendanceAction,
  posState,
} from "../../src/modules/attendance";
import {
  prepareSale,
  changeSale,
  type PrepareSale,
} from "../../src/modules/sales";
import { syncDailyReport } from "../../src/modules/daily-report/sync";
import { jakartaDate, serial } from "../../src/modules/daily-report/dates";
import {
  SheetsError,
  TEST_SPREADSHEET_ID,
} from "../../src/modules/sheets/config";
import { syncSheets } from "../../src/modules/sheets/sync";
import { savePromo, listPromos } from "../../src/modules/promos/server";
import type {
  DailyTransport,
  ReportPrepare,
  ReportWrite,
} from "../../src/modules/daily-report/types";
const config = { mode: "test" as const, spreadsheetId: TEST_SPREADSHEET_ID };
let token: string, itemId: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE sheets_daily_target,sheets_daily_day,promotion,employee,device,menu_item,sheets_sync_target,throttle CASCADE",
  );
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  itemId = (
    await db
      .insert(menuItem)
      .values({ name: "Original", price: 32000 })
      .returning()
  )[0].id;
});
afterAll(async () => {
  await pool.end();
});
async function prepare() {
  const input: PrepareSale = {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: itemId, quantity: 1, unitPrice: 32000 }],
  };
  await prepareSale(token, input);
  return input.id;
}
async function complete(when?: string) {
  const id = await prepare();
  if (when) {
    await pool.query(
      "UPDATE sale SET status='paid',attested_at=$2 WHERE id=$1",
      [id, when],
    );
    await pool.query(
      "UPDATE sale SET status='completed',completed_at=$2 WHERE id=$1",
      [id, when],
    );
  } else {
    await changeSale(token, { id, action: "attest", paymentReceived: true });
    await changeSale(token, { id, action: "complete" });
  }
  return id;
}
function fake() {
  const cells = new Map<number, (string | number)[]>(),
    writes: ReportWrite[] = [],
    prepares: ReportPrepare[] = [];
  const transport: DailyTransport = {
    prepare: vi.fn(async (input) => {
      prepares.push(structuredClone(input));
      return 81004;
    }),
    write: vi.fn(async (input) => {
      writes.push(structuredClone(input));
      for (const row of input.rows)
        cells.set(row.rowNumber, structuredClone(row.values));
    }),
  };
  return {
    cells,
    writes,
    prepares,
    transport,
    run: () => syncDailyReport(pool, config, async () => transport, true),
  };
}
async function business() {
  const sources = [
    "sale",
    "sale_line",
    "sale_discount",
    "attendance",
    "menu_item",
    "employee",
    "device",
    "order_ticket",
    "work_session",
    "work_session_shift",
    "stock_item",
    "stock_movement",
    "sheets_sync_target",
    "sheets_sync_job",
    "sheets_sync_row",
    "owner_alert_state",
  ];
  const out = [];
  for (const table of sources)
    out.push(
      (
        await pool.query(
          `SELECT count(*) n,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) hash FROM ${table} t`,
        )
      ).rows[0],
    );
  return out;
}

it("backs up completed history and today without mutating existing source/export tables", async () => {
  const yesterday = new Date(Date.now() - 86400000),
    day = jakartaDate(yesterday),
    today = jakartaDate(new Date());
  await complete(day + "T12:00:00+07:00");
  await complete();
  await prepare();
  const before = await business(),
    f = fake();
  const result = await f.run();
  expect(result.state).toBe("synced");
  expect(result.processed).toBe(2);
  expect(f.writes.map((w) => w.date)).toEqual([today, day]);
  expect([...f.cells.values()].reduce((n, r) => n + Number(r[5]), 0)).toBe(
    64000,
  );
  expect([...f.cells.values()].every((r) => r[3] === "")).toBe(true);
  expect(await business()).toEqual(before);
  expect((await f.run()).processed).toBe(0);
  expect(f.prepares).toHaveLength(1);
});
it("retries lost applied replies at the same reserved rows and never blocks checkout", async () => {
  await complete();
  const f = fake(),
    write = f.transport.write;
  f.transport.write = async (input) => {
    await write(input);
    throw new SheetsError("google_unavailable");
  };
  expect((await f.run()).error).toBe("google_unavailable");
  const positions = [...f.cells.keys()];
  expect(
    (await pool.query("SELECT dirty FROM sheets_daily_day")).rows[0].dirty,
  ).toBe(true);
  const create = vi.fn(async () => f.transport);
  expect((await syncDailyReport(pool, config, create, true)).state).toBe(
    "retry",
  );
  expect(create).not.toHaveBeenCalled();
  await complete();
  f.transport.write = write;
  await pool.query("UPDATE sheets_daily_target SET next_attempt_at=now()");
  expect((await f.run()).state).toBe("synced");
  expect([...f.cells.keys()]).toEqual(positions);
  expect([...f.cells.values()][0][5]).toBe(64000);
});
it("detects a new sale committed during export on the following pass", async () => {
  await complete();
  const f = fake(),
    write = f.transport.write;
  f.transport.write = async (input) => {
    await complete();
    await write(input);
  };
  expect((await f.run()).processed).toBe(1);
  expect([...f.cells.values()][0][5]).toBe(32000);
  f.transport.write = write;
  expect((await f.run()).processed).toBe(1);
  expect([...f.cells.values()][0][5]).toBe(64000);
});
it("refreshes today's catalogue, freezes previous days and tombstones renamed zero-sale rows", async () => {
  const f = fake();
  await f.run();
  expect([...f.cells.values()][0][4]).toBe(32000);
  await pool.query(
    "UPDATE menu_item SET name='Renamed',price=50000 WHERE id=$1",
    [itemId],
  );
  expect((await f.run()).processed).toBe(1);
  expect([...f.cells.values()].filter((r) => r[1] !== "")).toEqual([
    expect.arrayContaining(["Renamed", 50000]),
  ]);
  expect([...f.cells.values()].filter((r) => r[1] === "")).toHaveLength(1);
  await pool.query(
    "UPDATE sheets_daily_target SET reconciled_at=now()-interval '2 days'",
  );
  expect((await f.run()).processed).toBe(1);
});
it("serializes report workers with an independent lock", async () => {
  const f = fake();
  let started!: () => void, release!: () => void;
  const start = new Promise<void>((r) => {
      started = r;
    }),
    wait = new Promise<void>((r) => {
      release = r;
    });
  f.transport.prepare = async () => {
    started();
    await wait;
    return 81004;
  };
  const running = f.run();
  await start;
  expect((await f.run()).state).toBe("busy");
  release();
  await running;
});
it("does nothing when disabled and refuses live export or changed stored destination", async () => {
  const create = vi.fn();
  expect((await syncDailyReport(pool, config, create, false)).state).toBe(
    "off",
  );
  expect(
    (await syncDailyReport(pool, { ...config, mode: "live" }, create, true))
      .error,
  ).toBe("test_environment_required");
  expect(create).not.toHaveBeenCalled();
  const f = fake();
  await f.run();
  await pool.query("UPDATE sheets_daily_target SET spreadsheet_id='foreign'");
  expect((await f.run()).error).toBe("destination_mismatch");
});
it("groups across Jakarta midnight correctly and never invents old unsold prices", async () => {
  const day = jakartaDate(new Date(Date.now() - 2 * 86400000)),
    next = jakartaDate(new Date(Date.now() - 86400000));
  await pool.query("UPDATE menu_item SET created_at=$1", [
    day + "T00:00:00+07:00",
  ]);
  await db.insert(menuItem).values({
    name: "Unsold old",
    price: 25000,
    createdAt: new Date(day + "T00:00:00+07:00"),
  });
  await complete(day + "T23:59:59+07:00");
  await complete(next + "T00:00:00+07:00");
  const f = fake();
  await f.run();
  for (const date of [day, next]) {
    const rows = [...f.cells.values()].filter((r) => r[0] === serial(date));
    expect(rows.reduce((n, r) => n + Number(r[5]), 0)).toBe(32000);
    expect(rows.find((r) => r[1] === "Unsold old")?.[4]).toBe("");
  }
  await pool.query("UPDATE menu_item SET name='Changed',price=50000");
  await f.run();
  expect(
    [...f.cells.values()]
      .filter((r) => r[0] === serial(day))
      .find((r) => r[1] === "Original")?.[4],
  ).toBe(32000);
});
it("report failures leave successful Sales and Attendance export receipts unchanged", async () => {
  await complete();
  const core = { prepare: vi.fn(async () => {}), write: vi.fn(async () => {}) };
  expect((await syncSheets(pool, config, async () => core)).state).toBe(
    "synced",
  );
  const before = await business(),
    f = fake();
  f.transport.prepare = async () => {
    throw new SheetsError("google_403");
  };
  expect((await f.run()).error).toBe("google_403");
  expect(await business()).toEqual(before);
  expect((await syncSheets(pool, config, async () => core)).processed).toBe(0);
});

it("reads saved promo allocations from real completed quotes after the owner changes the promo", async () => {
  await complete();
  const saved = await savePromo({
    rules: {
      name: "Halloween",
      percent: 10,
      scope: "all",
      productIds: [],
      minQuantity: 1,
      minDistinct: 1,
      minSpend: 0,
      maxDiscount: null,
      priority: 1,
      active: true,
    },
  });
  const promos = (await listPromos()).map((p) => ({
    id: p.id,
    revision: p.revision,
  }));
  const id = randomUUID();
  await prepareSale(token, {
    id,
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: itemId, quantity: 1, unitPrice: 32000 }],
    promos,
  });
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await changeSale(token, { id, action: "complete" });
  const current = (await listPromos())[0];
  const rules = (
    await pool.query("SELECT rules FROM promotion WHERE id=$1", [saved.id])
  ).rows[0].rules;
  await savePromo({
    id: saved.id,
    revision: current.revision,
    rules: { ...rules, name: "Different", percent: 50 },
  });
  const f = fake();
  expect((await f.run()).state).toBe("synced");
  expect([...f.cells.values()][0].slice(1, 7)).toEqual([
    "Original",
    2,
    "",
    32000,
    60800,
    "Halloween (10%): -Rp3.200",
  ]);
});
