import type { DiagnosticEvent, DiagnosticInput } from "./types";

const paths = new Set([
  "/", "/owner", "/admin", "/worker/sheets", "/worker/daily-report", "/api/pos", "/api/menu", "/api/promos",
  "/api/orders", "/api/sales", "/api/auth/sign-in/email", "/api/auth/sign-out",
  "/api/auth/get-session", "/api/owner", "/api/owner/report", "/api/owner/menu",
  "/api/owner/menu/photos", "/api/owner/employees", "/api/owner/preferences",
  "/api/owner/device", "/api/owner/stock", "/api/owner/promos", "/api/owner/alerts",
  "/api/owner/sheets", "/api/admin/session", "/api/admin/owners", "/api/admin/employees",
]);
const codes = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE",
  "40P01", "40001", "23505", "23503", "42P01", "42703", "28P01", "53300", "57P01", "57014", "08006",
  "configuration", "credentials_configuration", "live_setup_required", "test_environment_required",
  "destination_mismatch", "source_missing", "unavailable", "forbidden", "quota", "unauthorized",
  "layout_conflict", "batch_too_large", "report_capacity", "report_layout_conflict", "report_formula_error",
  "discount_mismatch", "revenue_mismatch", "invalid_source", "invalid_catalog", "source_changed",
  "report_not_prepared", "report_batch_too_large", "report_cell_too_large", "future_sale_date", "timeout",
  "google_401", "google_403", "google_404", "google_429", "google_unavailable",
]);
const names = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "TimeoutError", "AbortError", "SheetsError", "DailyReportError"]);

/** Drop query values, dynamic identifiers and unknown routes before logging. */
export function diagnosticPath(input = "") {
  try {
    const path = new URL(input, "http://diagnostic.invalid").pathname;
    if (paths.has(path)) return path;
    if (/^\/api\/menu-photos\/[a-f0-9-]+\.webp$/.test(path)) return "/api/menu-photos/:image";
  } catch { /* Untrusted URLs are never copied into diagnostics. */ }
  return "/unknown";
}

/** Keep only known error codes; arbitrary exception messages are never stored. */
export function diagnosticCode(value: unknown) {
  return typeof value === "string" && codes.has(value) ? value : null;
}

/** A deployment identifier is a commit hash, never arbitrary environment text. */
export function diagnosticRelease(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{7,40}$/.test(value) ? value : "local";
}

/** Extract bounded code locations, excluding messages, URLs, queries and home paths. */
export function diagnosticFrames(value: unknown): string[] {
  const lines = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n").slice(1, 12) : [];
  const result: string[] = [];
  for (const line of lines.slice(0, 12)) {
    if (typeof line !== "string") continue;
    const match = line.match(/(?:^|[\s/(])((?:src|scripts)\/[a-zA-Z0-9_./[\]-]+\.[cm]?[jt]sx?|_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js|\.next\/server\/[a-zA-Z0-9_./[\]-]+\.js):(\d{1,7}):(\d{1,7})(?:[)\s]|$)/);
    if (match) result.push(`${match[1]}:${match[2]}:${match[3]}`);
    if (result.length === 5) break;
  }
  return [...new Set(result)];
}

/** Build a fixed, secret-free event shape; callers cannot add arbitrary context. */
export function diagnosticEvent(input: DiagnosticInput, id: string, at: Date, release: string): DiagnosticEvent {
  const error = input.error as { name?: unknown; stack?: unknown; code?: unknown; cause?: { code?: unknown } } | undefined;
  return {
    schemaVersion: 1, id, at: at.toISOString(), kind: input.kind, source: input.source,
    severity: input.kind === "cashier_load" || input.kind === "browser_request" ? "warning" : "error",
    path: diagnosticPath(input.path ?? (input.source === "worker" ? input.kind === "daily_report" ? "/worker/daily-report" : "/worker/sheets" : "")),
    method: ["GET", "POST", "DELETE", "PUT", "PATCH", "HEAD"].includes(input.method ?? "") ? input.method! : input.source === "worker" ? "BACKGROUND" : "UNKNOWN",
    release: diagnosticRelease(input.source === "browser" ? input.release ?? "local" : release),
    httpStatus: Number.isInteger(input.status) && input.status! >= 400 && input.status! <= 599 ? input.status! : null,
    errorKind: typeof error?.name === "string" && names.has(error.name) ? error.name : "Error",
    technicalCode: diagnosticCode(input.technicalCode ?? error?.cause?.code ?? error?.code),
    frames: diagnosticFrames(input.frames ?? error?.stack),
  };
}
