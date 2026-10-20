import type { Pool, PoolClient } from "pg";
import { SheetsError, sheetsErrorCode, type SheetsConfig } from "./config";
import {
  attendanceRow,
  saleRows,
  retryDelay,
  type ExportRow,
  type MappedRow,
  type RowMapping,
} from "./rows";
import type { SheetsTransport } from "./google";

const LOCK = 891104;
type Job = {
  id: number;
  kind: "sale" | "attendance";
  source_id: string;
  revision: number;
  attempts: number;
};
export type SyncResult = {
  state: "off" | "busy" | "synced" | "retry";
  processed: number;
  error?: string;
};
async function backfill(client: PoolClient) {
  await client.query(`INSERT INTO sheets_sync_job (kind,source_id,sale_id)
    SELECT 'sale',id,id FROM sale WHERE status='completed' ON CONFLICT (kind,source_id) DO NOTHING`);
  await client.query(`INSERT INTO sheets_sync_job (kind,source_id,attendance_id)
    SELECT 'attendance',id,id FROM attendance ON CONFLICT (kind,source_id) DO NOTHING`);
}
async function sourceRows(client: PoolClient, jobs: Job[]) {
  const rows: ExportRow[] = [];
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    for (const job of jobs) {
      if (job.kind === "sale") {
        const result = await client.query(
          "SELECT id,reference,completed_at,cashier_id,cashier_name,payment_method,total FROM sale WHERE id=$1 AND status='completed'",
          [job.source_id],
        );
        if (!result.rowCount) throw new SheetsError("source_missing");
        const lines = await client.query(
          "SELECT id,menu_item_id,name,quantity,unit_price,subtotal FROM sale_line WHERE sale_id=$1 ORDER BY id",
          [job.source_id],
        );
        const discount = await client.query(
          "SELECT snapshot FROM sale_discount WHERE sale_id=$1",
          [job.source_id],
        );
        rows.push(
          ...saleRows(
            result.rows[0],
            lines.rows,
            Number(job.id),
            discount.rows[0]?.snapshot,
          ),
        );
      } else {
        const result = await client.query(
          "SELECT a.id,a.employee_id,e.name,a.clock_in,a.clock_out FROM attendance a JOIN employee e ON e.id=a.employee_id WHERE a.id=$1",
          [job.source_id],
        );
        if (!result.rowCount) throw new SheetsError("source_missing");
        rows.push(attendanceRow(result.rows[0], Number(job.id)));
      }
    }
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export async function syncSheets(
  pool: Pool,
  config: SheetsConfig | null,
  createTransport: (signal: AbortSignal) => Promise<SheetsTransport>,
): Promise<SyncResult> {
  if (!config) return { state: "off", processed: 0 };
  const client = await pool.connect();
  const controller = new AbortController();
  const lostConnection = () => controller.abort();
  client.on("error", lostConnection);
  let locked = false;
  let jobs: Job[] = [];
  let targetBound = false;
  try {
    locked = (
      await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK])
    ).rows[0].locked;
    if (!locked) return { state: "busy", processed: 0 };
    await client.query(
      "INSERT INTO sheets_sync_target (spreadsheet_id,mode) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      [config.spreadsheetId, config.mode],
    );
    const target = (
      await client.query("SELECT * FROM sheets_sync_target WHERE id='primary'")
    ).rows[0];
    if (
      target.spreadsheet_id !== config.spreadsheetId ||
      target.mode !== config.mode
    )
      throw new SheetsError("destination_mismatch");
    targetBound = true;
    await backfill(client);
    // Daily refresh repairs missing/changed values and eventual ambiguous writes.
    if (Date.now() - target.reconciled_at.getTime() >= 86400000) {
      await client.query("BEGIN");
      try {
        await client.query(
          "UPDATE sheets_sync_job SET synced_revision=0,next_attempt_at=now() WHERE synced_revision=revision",
        );
        await client.query(
          "UPDATE sheets_sync_target SET reconciled_at=now() WHERE id='primary'",
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    jobs = (
      await client.query<Job>(
        "SELECT id,kind,source_id,revision,attempts FROM sheets_sync_job WHERE synced_revision<revision AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 25",
      )
    ).rows;
    await client.query(
      "UPDATE sheets_sync_target SET last_attempt_at=now() WHERE id='primary'",
    );
    if (!jobs.length) return { state: "synced", processed: 0 };
    const rows = await sourceRows(client, jobs);
    const mapped: MappedRow[] = [];
    for (const row of rows) {
      // Commit the reserved position before any Google write; retries PUT the
      // same cells even when Google applied a request whose reply was lost.
      const mapping = await client.query(
        `INSERT INTO sheets_sync_row (tab,source_id,job_id,row_number)
        SELECT $1,$2,$3,COALESCE(max(row_number),1)+1 FROM sheets_sync_row WHERE tab=$1
        ON CONFLICT (tab,source_id) DO UPDATE SET source_id=EXCLUDED.source_id RETURNING row_number`,
        [row.tab, row.sourceId, row.jobId],
      );
      mapped.push({ ...row, rowNumber: mapping.rows[0].row_number });
    }
    const mappings = (
      await client.query<RowMapping>(
        `SELECT tab,source_id AS "sourceId",row_number AS "rowNumber" FROM sheets_sync_row`,
      )
    ).rows;
    const transport = await createTransport(controller.signal);
    await transport.prepare(mappings);
    controller.signal.throwIfAborted();
    await transport.write(mapped);
    controller.signal.throwIfAborted();
    await client.query("BEGIN");
    try {
      for (const job of jobs)
        await client.query(
          "UPDATE sheets_sync_job SET synced_revision=GREATEST(synced_revision,$2),synced_at=now(),attempts=0,last_error=NULL,next_attempt_at=now() WHERE id=$1",
          [job.id, job.revision],
        );
      await client.query(
        "UPDATE sheets_sync_target SET last_success_at=now(),last_error=NULL WHERE id='primary'",
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    return { state: "synced", processed: jobs.length };
  } catch (error) {
    const code = sheetsErrorCode(error);
    if (targetBound && !controller.signal.aborted) {
      for (const job of jobs)
        await client.query(
          "UPDATE sheets_sync_job SET attempts=attempts+1,last_error=$2,next_attempt_at=now()+$3*interval '1 second' WHERE id=$1",
          [
            job.id,
            code,
            retryDelay(job.attempts) + Math.floor(Math.random() * 5),
          ],
        );
      await client.query(
        "UPDATE sheets_sync_target SET last_error=$1 WHERE id='primary'",
        [code],
      );
    }
    return { state: "retry", processed: 0, error: code };
  } finally {
    try {
      if (locked && !controller.signal.aborted)
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK]);
    } finally {
      client.off("error", lostConnection);
      client.release(controller.signal.aborted);
    }
  }
}
