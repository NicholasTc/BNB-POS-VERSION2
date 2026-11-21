import { assertSheetsTarget } from "./config";

export type SyncTargetStatus = {
  mode: string;
  spreadsheet_id: string;
  last_success_at: Date | null;
  last_attempt_at: Date | null;
  last_error: string | null;
};
export type SyncQueueStatus = { total: number; pending: number; failed: number };

/** Read-only presentation. A recorded destination never authorizes exports. */
export function resolveSheetsStatus(
  target: SyncTargetStatus | null,
  queue: SyncQueueStatus,
  databaseUrl: string | undefined,
  settings: Record<string, string | undefined> = process.env,
  now = Date.now(),
) {
  let mode: "off" | "test" | "live" | "configuration" = "off";
  let configurationError = false;
  try {
    if (target) {
      if (target.mode !== "test" && target.mode !== "live")
        throw new Error("invalid_target");
      // The worker already confirmed this durable binding. Validate its ID and
      // actual DB scope without requiring Google credentials on the web app.
      assertSheetsTarget(target.mode, target.spreadsheet_id, databaseUrl, true);
      mode = target.mode;
    } else {
      const requested = settings.SHEETS_SYNC_MODE ?? "off";
      if (requested !== "off") {
        if (requested !== "test" && requested !== "live")
          throw new Error("invalid_mode");
        assertSheetsTarget(
          requested,
          settings.SHEETS_SPREADSHEET_ID ?? "",
          databaseUrl,
          settings.SHEETS_LIVE_CONFIRMED === "true",
        );
        mode = requested;
      }
    }
  } catch {
    mode = "configuration";
    configurationError = true;
  }
  const attempted = target?.last_attempt_at?.getTime();
  const workerStale = attempted === undefined || !Number.isFinite(attempted) ||
    now - attempted > 120000 || attempted - now > 60000;
  const error = configurationError ? "destination_mismatch" : target?.last_error ?? null;
  const health = mode === "off" ? "disabled"
    : mode === "configuration" ? "configuration"
      : error || queue.failed > 0 || (target && workerStale) ? "delayed"
        : !target?.last_success_at ? "waiting"
          : queue.pending > 0 ? "pending" : "healthy";
  return {
    mode,
    ...queue,
    health,
    lastSuccessAt: target?.last_success_at ?? null,
    lastAttemptAt: target?.last_attempt_at ?? null,
    workerStale,
    error,
    liveSetupPending: mode !== "live",
  };
}
