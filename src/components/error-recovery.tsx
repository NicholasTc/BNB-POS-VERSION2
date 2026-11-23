"use client";
import { useEffect } from "react";
import { reportBrowserDiagnostic } from "@/modules/diagnostics/browser";

/** Caught React failures → safe report and explicit reset; never retry a payment or clear recovery storage. */
export function ErrorRecovery({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { reportBrowserDiagnostic("browser_crash", undefined, error); }, [error]);
  return <main className="center-stage stack"><section className="card stack" role="alert">
    <h1>Tampilan belum dapat dimuat</h1>
    <p>Coba muat ulang tampilan. Jika pembayaran sedang berlangsung, periksa transaksi yang tersimpan sebelum menerima pembayaran lagi.</p>
    <button onClick={reset}>Muat ulang tampilan</button>
  </section></main>;
}
