import { notifyDataUpdated } from "./live-updates";
import { notifyOwnerSignedOut } from "./owner-session-events";
import { reportBrowserDiagnostic } from "@/modules/diagnostics/browser";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reference?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  payload?: unknown,
  options: { signal?: AbortSignal; background?: boolean } = {},
): Promise<T> {
  let response: Response;
  let result;
  try {
    response = await fetch(path, {
    method: payload === undefined ? "GET" : "POST",
    headers:
      payload === undefined
        ? options.background
          ? { "X-Lisi-Background": "1" }
          : {}
        : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
    signal: options.signal,
    });
    result = await response.json();
  } catch (error) {
    if (!options.signal?.aborted)
      reportBrowserDiagnostic("browser_request", path, error, payload === undefined ? "GET" : "POST");
    throw error;
  }
  if (!response.ok) {
    const reference = response.headers.get("X-Lisi-Error-Id") ?? result.reference;
    if (response.status >= 500 && !reference)
      reportBrowserDiagnostic("browser_request", path, undefined, payload === undefined ? "GET" : "POST");
    if (
      response.status === 401 &&
      (path === "/api/owner" || path.startsWith("/api/owner/")) &&
      !options.signal?.aborted
    )
      notifyOwnerSignedOut();
    throw new ApiError(
      response.status,
      result.error ?? result.message ?? "Permintaan belum berhasil. Coba lagi.",
      typeof reference === "string" && /^[a-f0-9-]{36}$/.test(reference) ? reference : undefined,
    );
  }
  if (path === "/api/auth/sign-out") notifyOwnerSignedOut();
  if (
    payload !== undefined &&
    (path.startsWith("/api/owner/") ||
      path === "/api/admin/employees" ||
      path === "/api/sales" ||
      path === "/api/orders" ||
      (path === "/api/pos" &&
        (payload as { action?: string }).action !== "touch"))
  )
    notifyDataUpdated();
  return result as T;
}
