"use client";
import { useEffect } from "react";
import { UPDATE_CHANNEL, UPDATE_EVENT } from "./live-updates";

export const REFRESH_INTERVAL_MS = 5000;

/** Read-only refreshes: no overlaps, hidden-tab traffic, or work after cleanup. */
export function useAutoRefresh(
  refresh: (signal: AbortSignal) => Promise<void>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let running = false;
    const run = async () => {
      if (
        document.visibilityState !== "visible" ||
        running ||
        controller.signal.aborted
      )
        return;
      running = true;
      try {
        await refresh(controller.signal);
      } catch {
        /* Callers retain data and expose a quiet stale-data status. */
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void run(), REFRESH_INTERVAL_MS);
    const onEvent = () => void run();
    window.addEventListener("focus", onEvent);
    window.addEventListener("online", onEvent);
    window.addEventListener(UPDATE_EVENT, onEvent);
    document.addEventListener("visibilitychange", onEvent);
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(UPDATE_CHANNEL);
      channel.onmessage = onEvent;
    } catch {
      /* Polling works without cross-tab signals. */
    }
    return () => {
      controller.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", onEvent);
      window.removeEventListener("online", onEvent);
      window.removeEventListener(UPDATE_EVENT, onEvent);
      document.removeEventListener("visibilitychange", onEvent);
    };
  }, [refresh, enabled]);
}
