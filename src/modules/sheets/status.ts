import { pool } from "@/db";
import { sheetsConfig } from "./config";
export async function sheetsStatus() {
  let mode: "off" | "test" | "live" | "configuration" = "off";
  let configured: ReturnType<typeof sheetsConfig> = null;
  try {
    configured = sheetsConfig();
    mode = configured?.mode ?? "off";
  } catch {
    mode = "configuration";
  }
  const result = await pool.query(
    "SELECT count(*)::int AS total,count(*) FILTER (WHERE synced_revision<revision)::int AS pending,count(*) FILTER (WHERE synced_revision<revision AND last_error IS NOT NULL)::int AS failed FROM sheets_sync_job",
  );
  const target = (
    await pool.query(
      "SELECT spreadsheet_id,mode,last_success_at,last_attempt_at,last_error FROM sheets_sync_target WHERE id='primary'",
    )
  ).rows[0];
  const mismatch =
    configured &&
    target &&
    (configured.spreadsheetId !== target.spreadsheet_id ||
      configured.mode !== target.mode);
  return {
    mode,
    ...result.rows[0],
    lastSuccessAt: target?.last_success_at ?? null,
    lastAttemptAt: target?.last_attempt_at ?? null,
    workerStale:
      !target?.last_attempt_at ||
      Date.now() - target.last_attempt_at.getTime() > 120000,
    error: mismatch ? "destination_mismatch" : (target?.last_error ?? null),
    liveSetupPending: mode !== "live",
  };
}
export async function retrySheets() {
  await pool.query(
    "UPDATE sheets_sync_job SET next_attempt_at=now(),attempts=0 WHERE synced_revision<revision",
  );
}
