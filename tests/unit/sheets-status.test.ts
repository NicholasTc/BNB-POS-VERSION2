import { it, expect } from "vitest";
import { resolveSheetsStatus, type SyncTargetStatus } from "../../src/modules/sheets/status-state";
import { LIVE_SPREADSHEET_ID, TEST_SPREADSHEET_ID } from "../../src/modules/sheets/config";
const now = Date.parse("2026-11-21T08:00:00Z");
const remote = "postgresql://u:p@postgres.railway.internal/railway";
const local = "postgresql://u:p@127.0.0.1:55439/lisi_test";
const queue = { total: 7, pending: 0, failed: 0 };
const target: SyncTargetStatus = {
  mode: "live", spreadsheet_id: LIVE_SPREADSHEET_ID,
  last_success_at: new Date(now - 86400000),
  last_attempt_at: new Date(now - 30000), last_error: null,
};
it("reads the healthy worker binding when web export mode is off and Google credentials are absent", () => {
  expect(resolveSheetsStatus(target, queue, remote, { SHEETS_SYNC_MODE: "off" }, now))
    .toMatchObject({ mode: "live", health: "healthy", workerStale: false, liveSetupPending: false });
});
it("does not require or inspect web Google credentials for a bound worker", () => {
  const settings = new Proxy({}, { get() { throw new Error("Web settings must not be needed"); } });
  expect(resolveSheetsStatus(target, queue, remote, settings, now).health).toBe("healthy");
});
it("reports stopped/stale workers as delayed rather than healthy or disabled", () => {
  for (const time of [null, new Date(now - 120001), new Date(now + 60001), new Date(NaN)]) {
    expect(resolveSheetsStatus({ ...target, last_attempt_at: time }, queue, remote, {}, now))
      .toMatchObject({ mode: "live", health: "delayed", workerStale: true });
  }
});
it("distinguishes queued work, worker errors and a first sync that has not succeeded", () => {
  expect(resolveSheetsStatus(target, { ...queue, pending: 1 }, remote, {}, now).health).toBe("pending");
  expect(resolveSheetsStatus(target, { ...queue, failed: 1 }, remote, {}, now).health).toBe("delayed");
  expect(resolveSheetsStatus({ ...target, last_error: "google_403" }, queue, remote, {}, now))
    .toMatchObject({ health: "delayed", error: "google_403" });
  expect(resolveSheetsStatus({ ...target, last_success_at: null }, queue, remote, {}, now).health).toBe("waiting");
});
it("keeps a valid test worker in test mode independently of web credentials", () => {
  expect(resolveSheetsStatus({ ...target, mode: "test", spreadsheet_id: TEST_SPREADSHEET_ID }, queue, local, {}, now))
    .toMatchObject({ mode: "test", health: "healthy", liveSetupPending: true });
});
it("does not trust a stored live binding on a test database or an arbitrary destination", () => {
  for (const [binding, url] of [[target, local], [{ ...target, spreadsheet_id: TEST_SPREADSHEET_ID }, remote], [{ ...target, mode: "other" }, remote]] as const) {
    expect(resolveSheetsStatus(binding, queue, url, {}, now))
      .toMatchObject({ mode: "configuration", health: "configuration", error: "destination_mismatch" });
  }
});
it("keeps an unconfigured site disabled and a configured but unseen worker waiting", () => {
  expect(resolveSheetsStatus(null, queue, local, {}, now)).toMatchObject({ mode: "off", health: "disabled" });
  expect(resolveSheetsStatus(null, queue, remote, {
    SHEETS_SYNC_MODE: "live", SHEETS_SPREADSHEET_ID: LIVE_SPREADSHEET_ID, SHEETS_LIVE_CONFIRMED: "true",
  }, now)).toMatchObject({ mode: "live", health: "waiting", workerStale: true });
});
it("rejects invalid settings without a worker and returns only public status metadata", () => {
  expect(resolveSheetsStatus(null, queue, local, { SHEETS_SYNC_MODE: "live" }, now).health).toBe("configuration");
  const result = resolveSheetsStatus(target, queue, remote, {}, now);
  expect(Object.keys(result).sort()).toEqual(["mode", "health", "total", "pending", "failed", "lastSuccessAt", "lastAttemptAt", "workerStale", "error", "liveSetupPending"].sort());
});
