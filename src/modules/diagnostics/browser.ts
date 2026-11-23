"use client";
import { diagnosticPath, diagnosticFrames, diagnosticRelease } from "./safe";

let enabled = false;
let loadedRelease = "local";
let sentAt: number[] = [];
let inFlight = 0;
const recent = new Map<string, number>();

/** Layout controls browser collection; this state never grants access to the ingestion API. */
export function enableBrowserDiagnostics(value: boolean, release = "local") { enabled = value; loadedRelease = diagnosticRelease(release); }

/** Report fixed metadata only, with local rate/dedup limits and no automatic write retries. */
export function reportBrowserDiagnostic(kind: "browser_crash" | "browser_request" | "cashier_load", path?: string, error?: unknown, method: "GET" | "POST" | "DELETE" | "UNKNOWN" = "UNKNOWN") {
  if (!enabled || typeof window === "undefined") return;
  try {
    const now = Date.now();
    const safePath = diagnosticPath(path ?? window.location.pathname);
    if ((path ?? "").startsWith("/api/diagnostics") || (path ?? "").startsWith("/api/admin/logs")) return;
    const fingerprint = kind + ":" + safePath + ":" + method;
    sentAt = sentAt.filter(at => now - at < 60000);
    if (inFlight >= 2 || sentAt.length >= 8 || now - (recent.get(fingerprint) ?? 0) < 10000) return;
    if ((error as { name?: string })?.name === "AbortError") return;
    recent.set(fingerprint, now);
    if (recent.size > 100) recent.delete(recent.keys().next().value!);
    sentAt.push(now);
    const payload = {
      id: crypto.randomUUID(), kind, path: safePath, method, release: loadedRelease,
      timeout: (error as { name?: string })?.name === "TimeoutError",
      frames: diagnosticFrames((error as { stack?: unknown })?.stack),
    };
    inFlight++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    void Promise.resolve().then(() => fetch("/api/diagnostics", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), credentials: "same-origin", cache: "no-store", signal: controller.signal,
    })).catch(() => {}).finally(() => { clearTimeout(timeout); inFlight--; });
  } catch { /* Reporting failure cannot replace the original browser error. */ }
}
