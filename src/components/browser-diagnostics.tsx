"use client";
import { useEffect } from "react";
import { enableBrowserDiagnostics, reportBrowserDiagnostic } from "@/modules/diagnostics/browser";

/** Uncaught browser events → bounded sanitized collector; no console interception or session replay. */
export function BrowserDiagnostics({ enabled, release }: { enabled: boolean; release: string }) {
  useEffect(() => {
    enableBrowserDiagnostics(enabled, release);
    const error = (event: ErrorEvent) => reportBrowserDiagnostic("browser_crash", undefined, event.error);
    const rejection = (event: PromiseRejectionEvent) => reportBrowserDiagnostic("browser_crash", undefined, event.reason);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      enableBrowserDiagnostics(false);
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, [enabled, release]);
  return null;
}
