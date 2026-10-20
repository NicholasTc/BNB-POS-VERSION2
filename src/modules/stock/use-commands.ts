"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client";
import type { StockCommand, StockResult } from "./types";
const PREFIX = "lisi.stock.pending.";
// Persist identifiers only. No owner stock values, recipes or credentials are
// left in a shared cashier browser. Owner auth is required to resolve receipts.
function pendingIds() {
  try {
    return Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith(PREFIX) &&
          z.uuid().safeParse(key.slice(PREFIX.length)).success,
      )
      .map((key) => key.slice(PREFIX.length));
  } catch {
    throw new Error(
      "Penyimpanan browser tidak tersedia. Aktifkan penyimpanan sebelum mengubah stok.",
    );
  }
}
export function useStockCommands(active: boolean) {
  const [pending, setPending] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const sync = useCallback(() => {
    const ids = pendingIds();
    setPending(ids);
    return ids;
  }, []);
  const [error, setError] = useState("");
  const check = useCallback(async () => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    try {
      for (const id of pendingIds()) {
        const receipt = await api<StockResult | null>(
          `/api/owner/stock?view=command&id=${id}`,
          undefined,
          { background: true, signal: AbortSignal.timeout(12000) },
        );
        if (receipt) localStorage.removeItem(PREFIX + id);
      }
      sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
      setReady(true);
    }
  }, [sync]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void check();
    });
    const update = () => {
      try {
        sync();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    window.addEventListener("storage", update);
    return () => {
      live = false;
      window.removeEventListener("storage", update);
    };
  }, [active, check, sync]);
  async function run(input: StockCommand) {
    if (writing.current) throw new Error("Tunggu sampai penyimpanan selesai.");
    if (pendingIds().length)
      throw new Error(
        "Periksa perubahan stok yang belum pasti terlebih dahulu.",
      );
    writing.current = true;
    setBusy(true);
    setError("");
    let stored = false;
    try {
      localStorage.setItem(PREFIX + input.id, "1");
      stored = true;
      sync();
      const result = await api<StockResult>("/api/owner/stock", input, {
        signal: AbortSignal.timeout(12000),
      });
      localStorage.removeItem(PREFIX + input.id);
      sync();
      return result;
    } catch (e) {
      if (
        stored &&
        e instanceof ApiError &&
        e.status < 500 &&
        e.status !== 408
      ) {
        localStorage.removeItem(PREFIX + input.id);
        sync();
      }
      setError((e as Error).message);
      throw e;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  async function abandon() {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    try {
      for (const id of pendingIds()) {
        await api<StockResult>(
          "/api/owner/stock",
          { id, action: "abandon" },
          { signal: AbortSignal.timeout(12000) },
        );
        localStorage.removeItem(PREFIX + id);
      }
      sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return { pending, ready, busy, error, run, check, abandon };
}
