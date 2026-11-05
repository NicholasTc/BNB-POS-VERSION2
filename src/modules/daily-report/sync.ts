import type { Pool, PoolClient } from "pg";
import {
  SheetsError,
  TEST_SPREADSHEET_ID,
  type SheetsConfig,
} from "@/modules/sheets/config";
import { dateRange, jakartaDate, serial } from "./dates";
import { hashReport, projectDay } from "./project";
import {
  DailyReportError,
  MAX_REPORT_ROWS,
  type CatalogItem,
  type DailySale,
  type DailyTransport,
  type ReportMapping,
  type ReportWrite,
} from "./types";

const LOCK = 891110;
export function reportGuard(
  config: SheetsConfig,
  connectionString: string | undefined,
) {
  try {
    const url = new URL(connectionString ?? "");
    if (
      config.mode === "test" &&
      config.spreadsheetId === TEST_SPREADSHEET_ID &&
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      ["/lisi_dev", "/lisi_test"].includes(url.pathname) &&
      !url.search
    )
      return;
  } catch {
    /* fail closed */
  }
  throw new DailyReportError("test_environment_required");
}
type Day = {
  date: string;
  sale_count: number;
  catalog: CatalogItem[];
  catalog_hash: string;
  status_row: number;
  catalog_historical: boolean;
};

async function discover(client: PoolClient, today: string, reconcile: boolean) {
  const counts = (
    await client.query<{ date: string; count: number }>(
      `SELECT to_char(completed_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS date,count(*)::int AS count FROM sale WHERE status='completed' GROUP BY 1`,
    )
  ).rows;
  if (counts.some((c) => c.date > today))
    throw new DailyReportError("future_sale_date");
  const catalog = (
    await client.query<CatalogItem>(
      `SELECT id,name,price,to_char(created_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS "createdAt" FROM menu_item WHERE active ORDER BY id`,
    )
  ).rows;
  const existing = (
    await client.query<Day>("SELECT * FROM sheets_daily_day ORDER BY date")
  ).rows;
  const first = [
    today,
    ...counts.map((c) => c.date),
    ...catalog.map((c) => c.createdAt),
    ...existing.map((d) => d.date),
  ].sort()[0];
  const days = dateRange(first, today),
    count = new Map(counts.map((c) => [c.date, c.count]));
  const known = new Map(existing.map((d) => [d.date, d]));
  let statusRow = Math.max(5, ...existing.map((d) => d.status_row));
  for (const date of days) {
    const old = known.get(date);
    const historical = old?.catalog_historical ?? date < today;
    const items =
      old && date !== today
        ? old.catalog
        : catalog
            .filter((c) => c.createdAt <= date)
            .map((c) => ({ ...c, price: date === today ? c.price : null }));
    const hash = hashReport(items);
    if (!old)
      await client.query(
        "INSERT INTO sheets_daily_day (date,sale_count,catalog,catalog_hash,status_row,catalog_historical) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          date,
          count.get(date) ?? 0,
          JSON.stringify(items),
          hash,
          ++statusRow,
          historical,
        ],
      );
    else if (
      old.sale_count !== (count.get(date) ?? 0) ||
      old.catalog_hash !== hash ||
      reconcile
    )
      await client.query(
        "UPDATE sheets_daily_day SET sale_count=$2,catalog=$3,catalog_hash=$4,dirty=true WHERE date=$1",
        [date, count.get(date) ?? 0, JSON.stringify(items), hash],
      );
  }
  return { first, days: days.length };
}

async function reserve(
  client: PoolClient,
  day: Day,
  now: Date,
): Promise<ReportWrite> {
  const sales = (
    await client.query<DailySale>(
      `SELECT s.id,s.total,d.snapshot AS discount,
    (SELECT jsonb_agg(jsonb_build_object('id',l.id,'menuItemId',l.menu_item_id,'name',l.name,'quantity',l.quantity,'unitPrice',l.unit_price,'subtotal',l.subtotal) ORDER BY l.id) FROM sale_line l WHERE l.sale_id=s.id) AS lines
    FROM sale s LEFT JOIN sale_discount d ON d.sale_id=s.id WHERE s.status='completed' AND s.completed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Jakarta') AND s.completed_at < (($1::date+1)::timestamp AT TIME ZONE 'Asia/Jakarta') ORDER BY s.id`,
      [day.date],
    )
  ).rows;
  if (sales.length !== day.sale_count)
    throw new DailyReportError("source_changed");
  const rows = projectDay(day.date, sales, day.catalog);
  const current = (
    await client.query<ReportMapping>(
      `SELECT key,date,row_number AS "rowNumber",active FROM sheets_daily_row WHERE date=$1`,
      [day.date],
    )
  ).rows;
  const byKey = new Map(current.map((r) => [r.key, r]));
  let next = Number(
    (
      await client.query(
        "SELECT COALESCE(max(row_number),5)+1 AS next FROM sheets_daily_row",
      )
    ).rows[0].next,
  );
  const writes: ReportWrite["rows"] = [];
  for (const row of rows) {
    const rowNumber = byKey.get(row.key)?.rowNumber ?? next++;
    if (rowNumber > MAX_REPORT_ROWS + 5)
      throw new DailyReportError("report_capacity");
    await client.query(
      "INSERT INTO sheets_daily_row (key,date,row_number) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET active=true",
      [row.key, day.date, rowNumber],
    );
    writes.push({
      rowNumber,
      values: [
        serial(day.date),
        row.name,
        row.quantity,
        "",
        row.price ?? "",
        row.revenue,
        row.notes,
        row.key,
      ],
    });
    byKey.delete(row.key);
  }
  for (const old of byKey.values()) {
    await client.query(
      "UPDATE sheets_daily_row SET active=false WHERE key=$1",
      [old.key],
    );
    writes.push({
      rowNumber: old.rowNumber,
      values: ["", "", "", "", "", "", "", old.key],
    });
  }
  return {
    date: day.date,
    rows: writes,
    statusRow: day.status_row,
    publishedAt: now.toISOString(),
    note: day.catalog_historical
      ? "Harga menu tanpa penjualan sebelum pencatatan laporan tidak diketahui."
      : "",
  };
}

export async function syncDailyReport(
  pool: Pool,
  config: SheetsConfig | null,
  create: (signal: AbortSignal) => Promise<DailyTransport>,
  enabled = process.env.SHEETS_DAILY_REPORT_ENABLED === "true",
  now = new Date(),
) {
  type Result = {
    state: "off" | "busy" | "synced" | "retry";
    processed: number;
    error?: string;
  };
  if (!enabled || !config) return { state: "off", processed: 0 } as Result;
  let client: PoolClient | undefined,
    locked = false,
    bound = false,
    transaction = false,
    processed = 0;
  const controller = new AbortController(),
    lost = () => controller.abort();
  try {
    reportGuard(config, pool.options.connectionString);
    client = await pool.connect();
    client.on("error", lost);
    locked = (
      await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK])
    ).rows[0].locked;
    if (!locked) return { state: "busy", processed: 0 } as Result;
    await client.query(
      "INSERT INTO sheets_daily_target (spreadsheet_id,mode) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      [config.spreadsheetId, config.mode],
    );
    const target = (
      await client.query("SELECT * FROM sheets_daily_target WHERE id='primary'")
    ).rows[0];
    if (
      target.spreadsheet_id !== config.spreadsheetId ||
      target.mode !== config.mode
    )
      throw new DailyReportError("destination_mismatch");
    bound = true;
    if (target.attempts > 0 && target.next_attempt_at > now)
      return {
        state: "retry",
        processed: 0,
        error: target.last_error ?? "backoff",
      } as Result;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    transaction = true;
    const today = jakartaDate(now),
      reconcile = now.getTime() - target.reconciled_at.getTime() >= 86400000;
    const discovered = await discover(client, today, reconcile);
    const days = (
      await client.query<Day>(
        "SELECT * FROM sheets_daily_day WHERE dirty ORDER BY (date=$1) DESC,date LIMIT 7",
        [today],
      )
    ).rows;
    const writes: ReportWrite[] = [];
    for (const day of days) writes.push(await reserve(client, day, now));
    if (reconcile)
      await client.query(
        "UPDATE sheets_daily_target SET reconciled_at=$1 WHERE id='primary'",
        [now],
      );
    await client.query("COMMIT");
    transaction = false;
    if (!writes.length) return { state: "synced", processed: 0 } as Result;
    const mappings = (
      await client.query<ReportMapping>(
        'SELECT key,date,row_number AS "rowNumber",active FROM sheets_daily_row',
      )
    ).rows;
    const transport = await create(controller.signal);
    const sheetId = await transport.prepare({
      today,
      earliest: discovered.first,
      days: discovered.days,
      mappings,
      expectedSheetId: target.sheet_id,
    });
    controller.signal.throwIfAborted();
    await client.query(
      "UPDATE sheets_daily_target SET sheet_id=$1 WHERE id='primary'",
      [sheetId],
    );
    for (const write of writes) {
      await transport.write(write);
      controller.signal.throwIfAborted();
      await client.query(
        "UPDATE sheets_daily_day SET dirty=false,published_at=$2 WHERE date=$1",
        [write.date, now],
      );
      processed++;
    }
    await client.query(
      "UPDATE sheets_daily_target SET last_success_at=$1,last_error=NULL,attempts=0,next_attempt_at=$1 WHERE id='primary'",
      [now],
    );
    return { state: "synced", processed } as Result;
  } catch (error) {
    if (transaction && client && !controller.signal.aborted)
      await client.query("ROLLBACK");
    const code =
      error instanceof DailyReportError || error instanceof SheetsError
        ? error.code
        : "unavailable";
    if (bound && client && !controller.signal.aborted)
      await client.query(
        "UPDATE sheets_daily_target SET last_error=$1,next_attempt_at=$2::timestamptz+LEAST(3600,30*power(2,LEAST(attempts,7)))*interval '1 second',attempts=LEAST(attempts+1,100) WHERE id='primary'",
        [code, now],
      );
    return { state: "retry", processed, error: code } as Result;
  } finally {
    if (client) {
      try {
        if (locked && !controller.signal.aborted)
          await client.query("SELECT pg_advisory_unlock($1)", [LOCK]);
      } finally {
        client.off("error", lost);
        client.release(controller.signal.aborted);
      }
    }
  }
}
