"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type { AlertCommand, AlertFeed } from "./types";
export function useOwnerAlerts(enabled: boolean) {
  const [data, setData] = useState<AlertFeed | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const version = useRef(0),
    writing = useRef(false);
  const load = useCallback(async (signal: AbortSignal, background = true) => {
    if (writing.current) return;
    const current = ++version.current;
    try {
      const result = await api<AlertFeed>("/api/owner/alerts", undefined, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        background,
      });
      if (!signal.aborted && current === version.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (!signal.aborted && current === version.current) {
        if (e instanceof ApiError && e.status === 401) setData(null);
        setError((e as Error).message);
      }
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [enabled, load]);
  useAutoRefresh(load, enabled && !busy);
  async function manage(command: AlertCommand) {
    if (writing.current) return;
    writing.current = true;
    version.current++;
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      const result = await api<AlertFeed>("/api/owner/alerts", command, {
        signal: AbortSignal.timeout(10000),
      });
      setData(result);
      setConfirmed(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setData(null);
      setError((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return {
    data,
    error,
    busy,
    confirmed,
    manage,
    refresh: () => load(new AbortController().signal, false),
  };
}
