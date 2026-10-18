"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./client";
import { subscribeOwnerSignedOut } from "./owner-session-events";
import { useAutoRefresh } from "./use-auto-refresh";

/** Preserve form drafts while hiding background/cached views until revalidated. */
export function useOwnerAccess(enabled: boolean, clearOwner: () => void) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const validate = useCallback(async (signal: AbortSignal) => {
    try {
      await api("/api/owner", undefined, { signal, background: true });
      if (!signal.aborted) {
        setChecking(false);
        setError("");
      }
    } catch (e) {
      if (!signal.aborted && !(e instanceof ApiError && e.status === 401)) {
        setChecking(true);
        setError((e as Error).message);
      }
    }
  }, []);
  useAutoRefresh(validate, enabled);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const unsubscribe = subscribeOwnerSignedOut(() => {
      setChecking(false);
      setError("");
      clearOwner();
    });
    const mask = () => setChecking(true);
    const restored = () => {
      setChecking(true);
      void validate(controller.signal);
    };
    const visibility = mask;
    let lastActivity = 0;
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        document.visibilityState !== "visible" ||
        Date.now() - lastActivity < 60000
      )
        return;
      lastActivity = Date.now();
      void api("/api/owner").catch(() => {});
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("blur", mask);
    window.addEventListener("focus", mask);
    window.addEventListener("pagehide", mask);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort();
      unsubscribe();
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("blur", mask);
      window.removeEventListener("focus", mask);
      window.removeEventListener("pagehide", mask);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, clearOwner, validate]);
  return { checking, error };
}
