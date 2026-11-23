import type { DiagnosticKind } from "./types";

// Summaries describe observed symptoms. Checks are suggestions, never asserted causes.
export const diagnosticCopy: Record<DiagnosticKind, { title: string; meaning: string; checks: string[] }> = {
  request_failed: {
    title: "A server request failed",
    meaning: "An API request could not finish normally. This does not prove a payment or sale was lost.",
    checks: ["Inspect the affected route, error code and code location below.", "For checkout errors, inspect the existing sale reference before any manual retry.", "Compare the deployment version and time with Railway logs."],
  },
  database_connection: {
    title: "The database connection dropped",
    meaning: "The database pool reported a connection error. The original database error message is excluded to protect credentials.",
    checks: ["Check PostgreSQL health and connection limits in Railway.", "Check whether a database restart or deployment happened at this time.", "Use the safe technical code below to distinguish a timeout from a refused connection."],
  },
  server_render: {
    title: "A page failed on the server",
    meaning: "Next.js reported a server-side page or route error.",
    checks: ["Check the page and code location below.", "Compare the release with the last working version.", "Check Railway logs if no code location was available."],
  },
  browser_crash: {
    title: "A browser screen encountered an error",
    meaning: "The browser reported an uncaught JavaScript error or rejected promise. Browser reports are untrusted observations.",
    checks: ["Check whether this repeats on the same page and release.", "Use the bundle location to inspect the matching build.", "If checkout was in progress, confirm the saved transaction before retrying payment."],
  },
  browser_request: {
    title: "The browser could not finish a request",
    meaning: "A request failed to reach the service, returned invalid data or received a server failure without a diagnostic reference.",
    checks: ["Check the device internet connection and Railway availability.", "Compare the route and time with server issues.", "A failed response does not prove the underlying write failed; use existing recovery checks."],
  },
  cashier_load: {
    title: "The cashier could not finish loading",
    meaning: "The existing bounded loading retries were exhausted. The logger did not retry a financial write.",
    checks: ["Check the affected menu, cashier-state or sale-recovery route.", "Check network stability and service response times.", "Inspect server issues from the same time; do not erase a pending sale to dismiss this error."],
  },
  sheets_sync: {
    title: "Sales or attendance export is delayed",
    meaning: "The spreadsheet worker reported an export failure. PostgreSQL remains the source of truth.",
    checks: ["Check worker availability, spreadsheet permissions and the safe code below.", "Inspect the pending export queue in the owner dashboard.", "Preserve existing export receipts; do not manually duplicate rows to repair delivery."],
  },
  daily_report: {
    title: "The daily spreadsheet report is delayed",
    meaning: "The independent daily-report export failed. This does not by itself mean Sales or Attendance export failed.",
    checks: ["Check spreadsheet layout conflicts and report-worker logs.", "Compare the saved sales with the requested Jakarta report date.", "Keep the existing report metadata and retries intact while investigating."],
  },
};

/** Explain only recognized codes; unknown faults remain explicitly undiagnosed. */
export function technicalHint(code: string | null) {
  const hints: Record<string, string> = {
    "40P01": "PostgreSQL detected a deadlock between transactions. Inspect lock order and concurrent requests.",
    "40001": "PostgreSQL could not serialize concurrent transactions.",
    "42P01": "A database table was not found. Check whether this deployment's migrations were applied.",
    "23505": "A database uniqueness constraint rejected a duplicate value.",
    "23503": "A database reference constraint rejected a missing related record.",
    "28P01": "PostgreSQL rejected database authentication. Check secret configuration privately.",
    "53300": "PostgreSQL reported too many connections.",
    "57014": "PostgreSQL cancelled a query, often because of a timeout.",
    ECONNREFUSED: "The target service refused the connection.",
    ETIMEDOUT: "A connection timed out.",
    credentials_configuration: "Check that exactly one Google service-account credential source is configured.",
    destination_mismatch: "The recorded export destination does not match the configured destination.",
    timeout: "The request exceeded the existing loading deadline.",
    google_401: "Google rejected service-account authentication. Check the worker credentials privately.",
    google_403: "Google denied access. Check that the spreadsheet is shared with the service account and the Sheets API is enabled.",
    google_404: "Google could not find the spreadsheet or the service account cannot see it.",
    google_429: "Google rate-limited requests. Check worker frequency and quota; preserve the existing retry backoff.",
    google_unavailable: "Google returned a server error. Check service availability and the existing retry queue.",
  };
  return code ? hints[code] ?? "This is a recognized module code. Inspect the matching module and Railway logs." : "No recognized technical code was available. Inspect the route and code location; the cause is not established.";
}
