"use client";
import { useCallback, useEffect, useState } from "react";
import { adminApi, ADMIN_ACCESS_LOST } from "./admin-client";
import { useAutoRefresh } from "./use-auto-refresh";
import { subscribeOwnerSignedOut } from "./owner-session-events";
export function useAdminAccess(enabled: boolean, clear: () => void) {
  const [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  const validate = useCallback(async (signal: AbortSignal) => {
    try {
      await adminApi("/api/admin/session", undefined, {
        background: true,
        signal,
      });
      if (!signal.aborted) {
        setChecking(false);
        setError("");
      }
    } catch (error) {
      if (!signal.aborted) {
        setChecking(true);
        setError((error as Error).message);
      }
    }
  }, []);
  useAutoRefresh(validate, enabled);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const lost = () => {
      setChecking(false);
      setError("");
      clear();
    };
    const mask = () => setChecking(true);
    const restore = () => {
      mask();
      void validate(controller.signal);
    };
    // An owner tab may reject this browser's valid admin-role cookie. Its
    // invalidation signal is only a hint; revalidate rather than logging out.
    const unsubscribe = subscribeOwnerSignedOut(restore);
    let lastActivity = 0;
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        document.visibilityState !== "visible" ||
        Date.now() - lastActivity < 60000
      )
        return;
      lastActivity = Date.now();
      void adminApi("/api/admin/session").catch(() => {});
    };
    window.addEventListener(ADMIN_ACCESS_LOST, lost);
    window.addEventListener("pagehide", mask);
    window.addEventListener("pageshow", restore);
    window.addEventListener("blur", mask);
    window.addEventListener("focus", restore);
    window.addEventListener("keydown", activity);
    window.addEventListener("pointerdown", activity);
    document.addEventListener("visibilitychange", restore);
    return () => {
      controller.abort();
      unsubscribe();
      window.removeEventListener(ADMIN_ACCESS_LOST, lost);
      window.removeEventListener("pagehide", mask);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("blur", mask);
      window.removeEventListener("focus", restore);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointerdown", activity);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [enabled, clear, validate]);
  return { checking, error };
}
