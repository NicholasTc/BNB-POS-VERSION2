import { pool } from "@/db";
import { resolveSheetsStatus, type SyncTargetStatus } from "./status-state";
export async function sheetsStatus() {
  const result = await pool.query(
    "SELECT count(*)::int AS total,count(*) FILTER (WHERE synced_revision<revision)::int AS pending,count(*) FILTER (WHERE synced_revision<revision AND last_error IS NOT NULL)::int AS failed FROM sheets_sync_job",
  );
  const target = (
    await pool.query<SyncTargetStatus>(
      "SELECT spreadsheet_id,mode,last_success_at,last_attempt_at,last_error FROM sheets_sync_target WHERE id='primary'",
    )
  ).rows[0];
  return resolveSheetsStatus(
    target ?? null,
    result.rows[0],
    pool.options.connectionString,
  );
}
export async function retrySheets() {
  await pool.query(
    "UPDATE sheets_sync_job SET next_attempt_at=now(),attempts=0 WHERE synced_revision<revision",
  );
}
