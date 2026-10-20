import { api, ApiError } from "./client";

type LoadPath =
  | "/api/auth/sign-out"
  | "/api/pos"
  | "/api/menu"
  | "/api/promos"
  | "/api/sales"
  | `/api/sales?id=${string}`;
export const CASHIER_LOAD_TIMEOUT_MS = 10000;
function cancelled(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Cancelled", "AbortError");
}
async function pause(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled(signal);
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
/** Bounded startup reads and idempotent logout only. Never retries sale writes. */
export async function loadCashier<T>(
  path: LoadPath,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw cancelled(signal);
    const controller = new AbortController();
    const abort = () => controller.abort(cancelled(signal!));
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(new DOMException("Loading timed out", "TimeoutError")),
      CASHIER_LOAD_TIMEOUT_MS,
    );
    try {
      const result = await api<T>(
        path,
        path === "/api/auth/sign-out" ? {} : undefined,
        { signal: controller.signal },
      );
      if (signal?.aborted) throw cancelled(signal);
      return result;
    } catch (error) {
      if (signal?.aborted) throw cancelled(signal);
      if (
        error instanceof ApiError &&
        error.status !== 408 &&
        error.status !== 429 &&
        error.status < 500
      )
        throw error;
      if (attempt === 2) {
        if (error instanceof ApiError) throw error;
        throw new Error("Koneksi belum stabil. Periksa koneksi dan coba lagi.");
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
    await pause(attempt === 0 ? 250 : 750, signal);
  }
}
