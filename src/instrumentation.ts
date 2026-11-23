import type { Instrumentation } from "next";

/** Next server errors → sanitized diagnostics; no headers, bodies or query values leave this hook. */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordDiagnostic } = await import("./modules/diagnostics/record");
    recordDiagnostic({ kind: "server_render", source: "server", path: request.path, method: request.method, error });
  } catch { /* Observability cannot replace the original framework error. */ }
};

/** Start diagnostic-only maintenance in Node; no schema or business work occurs during startup. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startDiagnosticMaintenance } = await import("./modules/diagnostics/record");
    startDiagnosticMaintenance();
  } catch { /* Platform console remains the independent fallback. */ }
}
