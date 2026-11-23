import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { diagnosticEvent } from "./safe";
import { persistDiagnostics, pruneDiagnostics } from "./store";
import type { DiagnosticInput, DiagnosticEvent } from "./types";

type State = { queue: DiagnosticEvent[]; timer?: ReturnType<typeof setTimeout>; maintenance?: ReturnType<typeof setInterval>; maintenanceStart?: ReturnType<typeof setTimeout>; flushing?: Promise<void>; pool?: Pool; fallbackAt: number };
const globalState = globalThis as unknown as { lisiDiagnostics?: State };
const state = globalState.lisiDiagnostics ??= { queue: [], fallbackAt: 0 };

/** A kill switch affects collection, never application authorization or data writes. */
export function diagnosticsEnabled() { return process.env.DIAGNOSTICS_ENABLED !== "false"; }

/** Console fallback is structured and never contains exception messages or credentials. */
function fallback() {
  if (Date.now() - state.fallbackAt < 60000) return;
  state.fallbackAt = Date.now();
  try { console.error(JSON.stringify({ event: "diagnostics_storage_unavailable", at: new Date().toISOString() })); } catch { /* Logging must not fail the caller. */ }
}

/** Diagnostics owns one bounded connection, independent of the checkout pool. */
function diagnosticPool() {
  if (!state.pool) {
    state.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 250, statement_timeout: 750, query_timeout: 1000, idleTimeoutMillis: 1000, allowExitOnIdle: true });
    state.pool.on("error", fallback);
  }
  return state.pool;
}

/** Schedule best-effort retention after startup, without delaying server readiness. */
export function startDiagnosticMaintenance() {
  if (!diagnosticsEnabled() || state.maintenance || state.maintenanceStart) return;
  /** Run diagnostic-only retention with independent fallback; synchronous pool/config failures must not escape the timer. */
  const clean = () => {
    try { void pruneDiagnostics(diagnosticPool()).catch(fallback); }
    catch { fallback(); }
  };
  state.maintenanceStart = setTimeout(() => {
    state.maintenanceStart = undefined;
    clean();
    state.maintenance = setInterval(clean, 3600000);
    state.maintenance.unref?.();
  }, 1000);
  state.maintenanceStart.unref?.();
}

/** Capture synchronously to console, then queue at most 100 safe events without awaiting SQL. */
export function recordDiagnostic(input: DiagnosticInput, eventId?: string) {
  if (!diagnosticsEnabled()) return null;
  try {
    const event = diagnosticEvent(input, eventId ?? randomUUID(), new Date(), process.env.RAILWAY_GIT_COMMIT_SHA ?? "local");
    try { console.error(JSON.stringify({ event: "application_diagnostic", ...event })); } catch { /* Independent console failure. */ }
    if (state.queue.length < 100) state.queue.push(event);
    else fallback();
    if (!state.timer && !state.flushing) {
      state.timer = setTimeout(() => { state.timer = undefined; void flushDiagnostics(); }, 100);
      state.timer.unref?.();
    }
    return event.id;
  } catch { fallback(); return null; }
}

/** Drain bounded batches on a separate one-connection pool; failures fall back without retry storms. */
export async function flushDiagnostics() {
  if (state.flushing) return state.flushing;
  if (state.timer) { clearTimeout(state.timer); state.timer = undefined; }
  if (!state.queue.length) return;
  state.flushing = (async () => {
    try {
      if (!state.queue.length) return;
      const pool = diagnosticPool();
      for (let i = 0; i < 10 && state.queue.length; i++) {
        const batch = state.queue.splice(0, 10);
        await persistDiagnostics(pool, batch);
      }
    } catch { state.queue.length = 0; fallback(); }
    finally {
      state.flushing = undefined;
      if (state.queue.length && !state.timer) {
        state.timer = setTimeout(() => { state.timer = undefined; void flushDiagnostics(); }, 100);
        state.timer.unref?.();
      }
    }
  })();
  return state.flushing;
}

/** Explicit worker/test shutdown drains queued diagnostics and releases only its own pool. */
export async function closeDiagnostics() {
  if (state.maintenanceStart) clearTimeout(state.maintenanceStart);
  if (state.maintenance) clearInterval(state.maintenance);
  state.maintenanceStart = undefined;
  state.maintenance = undefined;
  await flushDiagnostics();
  await state.pool?.end().catch(() => {});
  state.pool = undefined;
}
