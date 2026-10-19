import { notifyDataUpdated } from "./live-updates";
import { notifyOwnerSignedOut } from "./owner-session-events";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  payload?: unknown,
  options: { signal?: AbortSignal; background?: boolean } = {},
): Promise<T> {
  const response = await fetch(path, {
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
  const result = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      (path === "/api/owner" || path.startsWith("/api/owner/")) &&
      !options.signal?.aborted
    )
      notifyOwnerSignedOut();
    throw new ApiError(
      response.status,
      result.error ?? result.message ?? "Permintaan belum berhasil. Coba lagi.",
    );
  }
  if (path === "/api/auth/sign-out") notifyOwnerSignedOut();
  if (
    payload !== undefined &&
    (path.startsWith("/api/owner/") ||
      path === "/api/sales" ||
      path === "/api/orders" ||
      (path === "/api/pos" &&
        (payload as { action?: string }).action !== "touch"))
  )
    notifyDataUpdated();
  return result as T;
}
