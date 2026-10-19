import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
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
import { syncSheets } from "../../src/modules/sheets/sync";
import {
  SheetsError,
  TEST_SPREADSHEET_ID,
} from "../../src/modules/sheets/config";
import type { MappedRow } from "../../src/modules/sheets/rows";
import type { SheetsTransport } from "../../src/modules/sheets/google";
const config = { mode: "test" as const, spreadsheetId: TEST_SPREADSHEET_ID };
let token: string, input: PrepareSale;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE employee,device,menu_item,sheets_sync_target,throttle CASCADE",
  );
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  const [item] = await db
    .insert(menuItem)
    .values({ name: "Original coffee", price: 18000 })
    .returning();
  input = {
    id: randomUUID(),
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: item.id, quantity: 2, unitPrice: 18000 }],
  };
});
afterAll(async () => {
  await pool.end();
});
async function complete() {
  await prepareSale(token, input);
  await changeSale(token, {
    id: input.id,
    action: "attest",
    paymentReceived: true,
  });
  return changeSale(token, { id: input.id, action: "complete" });
}
function fake() {
  const cells = new Map<string, MappedRow>();
  const transport: SheetsTransport = {
    prepare: vi.fn(async () => {}),
    write: vi.fn(async (rows) => {
      for (const row of rows)
        cells.set(row.tab + ":" + row.rowNumber, structuredClone(row));
    }),
  };
  return {
    cells,
    transport,
    run: () => syncSheets(pool, config, async () => transport),
  };
}
it("queues only completed sales and attendance atomically, completion retry adds no job", async () => {
  await prepareSale(token, input);
  expect((await pool.query("SELECT kind FROM sheets_sync_job")).rows).toEqual([
    { kind: "attendance" },
  ]);
  await changeSale(token, {
    id: input.id,
    action: "attest",
    paymentReceived: true,
  });
  expect(
    (await pool.query("SELECT count(*) FROM sheets_sync_job")).rows[0].count,
  ).toBe("1");
  await changeSale(token, { id: input.id, action: "complete" });
  await changeSale(token, { id: input.id, action: "complete" });
  expect(
    (await pool.query("SELECT count(*) FROM sheets_sync_job")).rows[0].count,
  ).toBe("2");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE attendance SET clock_out=now()");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  expect(
    (
      await pool.query(
        "SELECT revision FROM sheets_sync_job WHERE kind='attendance'",
      )
    ).rows[0].revision,
  ).toBe(1);
});
it("backfills historical records, exports immutable snapshots, updates the same attendance row", async () => {
  await complete();
  await pool.query("DELETE FROM sheets_sync_job"); // Simulate records predating the module.
  await pool.query("UPDATE menu_item SET name='Changed',price=25000");
  const f = fake();
  expect((await f.run()).processed).toBe(2);
  expect(f.cells.size).toBe(3);
  const line = [...f.cells.values()].find((r) => r.tab === "Sale items")!;
  expect(line.values.slice(4)).toEqual(["Original coffee", 2, 18000, 36000]);
  const shift = [...f.cells.values()].find((r) => r.tab === "Attendance")!;
  expect(shift.values[4]).toBe("");
  await attendanceAction(token, "clock-out", "0123");
  expect((await f.run()).processed).toBe(1);
  expect(f.cells.size).toBe(3);
  expect(f.cells.get("Attendance:" + shift.rowNumber)?.sourceId).toBe(
    shift.sourceId,
  );
  expect(typeof f.cells.get("Attendance:" + shift.rowNumber)?.values[4]).toBe(
    "number",
  );
  expect(JSON.stringify([...f.cells.values()])).not.toMatch(
    /pin_hash|pin_lookup|password|0123/,
  );
});
it("recovers a lost applied reply without duplicates and leaves checkout available", async () => {
  await complete();
  const f = fake();
  const write = f.transport.write;
  f.transport.write = async (rows) => {
    await write(rows);
    throw new SheetsError("google_unavailable");
  };
  expect((await f.run()).state).toBe("retry");
  expect(f.cells.size).toBe(3);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM sheets_sync_job WHERE synced_revision=0 AND attempts=1",
      )
    ).rows[0].count,
  ).toBe("2");
  input = { ...input, id: randomUUID() };
  expect((await complete()).status).toBe("completed");
  f.transport.write = write;
  await pool.query("UPDATE sheets_sync_job SET next_attempt_at=now()");
  expect((await f.run()).state).toBe("synced");
  expect(f.cells.size).toBe(5);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM sheets_sync_job WHERE synced_revision<revision",
      )
    ).rows[0].count,
  ).toBe("0");
});
it("keeps newer clock-out pending if it arrives during an in-flight export", async () => {
  const f = fake(),
    write = f.transport.write;
  f.transport.write = async (rows) => {
    await attendanceAction(token, "clock-out", "0123");
    await write(rows);
  };
  await f.run();
  const job = (
    await pool.query("SELECT revision,synced_revision FROM sheets_sync_job")
  ).rows[0];
  expect(job).toEqual({ revision: 2, synced_revision: 1 });
  f.transport.write = write;
  await f.run();
  expect([...f.cells.values()][0].values[6]).toBe("finished");
});
it("serializes workers, refuses destination changes and supports disabled operation", async () => {
  const f = fake();
  let release!: () => void;
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.transport.prepare = async () => {
    started();
    await wait;
  };
  const running = f.run();
  await start;
  expect((await f.run()).state).toBe("busy");
  release();
  await running;
  expect(
    (
      await syncSheets(
        pool,
        { ...config, spreadsheetId: "other-test-spreadsheet" },
        async () => f.transport,
      )
    ).error,
  ).toBe("destination_mismatch");
  const create = vi.fn();
  expect((await syncSheets(pool, null, create)).state).toBe("off");
  expect(create).not.toHaveBeenCalled();
});
it("reconciles daily, retries permission errors and never changes attendance on cashier switch", async () => {
  const f = fake();
  await f.run();
  await attendanceAction(token, "switch", "0123");
  expect((await f.run()).processed).toBe(0);
  await pool.query(
    "UPDATE sheets_sync_target SET reconciled_at=now()-interval '2 days'",
  );
  expect((await f.run()).processed).toBe(1);
  await attendanceAction(token, "clock-out", "0123");
  f.transport.write = async () => {
    throw new SheetsError("google_403");
  };
  expect((await f.run()).error).toBe("google_403");
  expect(
    (await pool.query("SELECT clock_out FROM attendance")).rows[0].clock_out,
  ).not.toBeNull();
  expect(
    (
      await pool.query(
        "SELECT last_error,next_attempt_at>now() AS later FROM sheets_sync_job",
      )
    ).rows[0],
  ).toEqual({ last_error: "google_403", later: true });
});
