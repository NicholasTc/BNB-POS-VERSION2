import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  loadCashier,
  CASHIER_LOAD_TIMEOUT_MS,
} from "../../src/lib/cashier-load";
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("retries transient startup reads, without changing them into writes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "warming" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ error: "retry" }, { status: 502 }))
    .mockResolvedValue(Response.json({ paired: true }));
  vi.stubGlobal("fetch", fetcher);
  const result = loadCashier("/api/pos");
  await vi.runAllTimersAsync();
  expect(await result).toEqual({ paired: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(
    fetcher.mock.calls.every(
      ([, options]) => options.method === "GET" && options.body === undefined,
    ),
  ).toBe(true);
});
it("does not retry device/permission rejections", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: "not authorized" }, { status: 401 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(loadCashier("/api/pos")).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds a stalled fetch and retries instead of leaving loading permanent", async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        ),
    )
    .mockResolvedValue(Response.json(["menu"]));
  vi.stubGlobal("fetch", fetcher);
  const result = loadCashier("/api/menu");
  await vi.advanceTimersByTimeAsync(CASHIER_LOAD_TIMEOUT_MS + 1000);
  expect(await result).toEqual(["menu"]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels an obsolete load without scheduling more attempts", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = loadCashier("/api/menu", controller.signal);
  const assertion = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await assertion;
  await vi.runAllTimersAsync();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("stops after three failed attempts and exposes the safe server error", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ error: "temporarily unavailable" }, { status: 503 }),
    );
  vi.stubGlobal("fetch", fetcher);
  const assertion = expect(loadCashier("/api/menu")).rejects.toMatchObject({
    status: 503,
    message: "temporarily unavailable",
  });
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("only the explicit logout path uses an idempotent POST", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  await loadCashier("/api/auth/sign-out");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "POST",
    body: "{}",
  });
});
