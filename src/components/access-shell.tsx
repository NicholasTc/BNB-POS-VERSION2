"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import "./access-shell.css";

export const CASHIER_PATH = "/?access=cashier";
export const CASHIER_LOGIN_PATH = "/?access=cashier&login=1";

/** Presentation only: the leaf wordmark carries no account or device state. */
export function BnbMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 154 82" role="img" aria-label="BNB — Bites and Blends">
      <g fill="currentColor">
        <path d="M70 22C69 10 76 3 89 2c0 13-7 20-19 20Z" />
        <path d="M72 19 83 8" fill="none" stroke="#faf8f3" strokeWidth="1.8" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 29v44m0-44h15c18 0 18 22 0 22H10m0 0h17c18 0 18 22 0 22H10" />
        <path d="M59 73V29l29 44V29" />
        <path d="M106 29v44m0-44h15c18 0 18 22 0 22h-15m0 0h17c18 0 18 22 0 22h-17" />
      </g>
    </svg>
  );
}

export function AccessIcon({ name }: { name: "chart" | "device" | "lock" | "person" | "check" | "back" | "refresh" | "eye" | "offline" }) {
  const paths = {
    chart: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 16v-3m5 3V8m5 8v-5" /></>,
    device: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-4 0h8" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    back: <path d="m9 5-7 7 7 7M2 12h19" />,
    refresh: <path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    offline: <path d="m3 3 18 18M2 8a16 16 0 0 1 4-2m4-1a16 16 0 0 1 12 3M5 12a11 11 0 0 1 5-2m5 1a11 11 0 0 1 4 1m-11 4a6 6 0 0 1 8 0m-4 4h.01" />,
  };
  return <svg className="access-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

/** Shared visual frame; links select existing portals and never authorize a role. */
export function AccessShell({ children, mode = "cashier", setup = false, busy = false, tools, language = "id", onHome }: {
  children: ReactNode;
  mode?: "home" | "owner" | "cashier";
  setup?: boolean;
  busy?: boolean;
  tools?: ReactNode;
  language?: "id" | "en";
  onHome?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const preventBusy = (event: React.MouseEvent<HTMLAnchorElement>) => { if (busy) event.preventDefault(); };
  const text = (id: string, en: string) => language === "en" ? en : id;
  return (
    <div className="access-app" lang={language}>
      <header className="access-topbar">
        <Link className="access-brand" href="/" aria-label="BNB — pilihan akses" aria-disabled={busy} onClick={event => { preventBusy(event); if (!busy) onHome?.(event); }}>
          <span className="access-wordmark"><BnbMark /><small>Bites and Blends</small></span>
          <span className="access-brand-label">{mode === "home" ? "POS" : mode === "owner" ? text("Pemilik", "Owner") : text("Kasir", "Cashier")}</span>
        </Link>
        <div className="access-header-tools">
          {tools}
          {mode === "cashier" && <Link href="/owner" className="access-owner-link" aria-disabled={busy} onClick={preventBusy}><AccessIcon name="person" />{text("Dasbor pemilik", "Owner dashboard")}</Link>}
        </div>
      </header>
      <main className="access-main">
        <div className={`access-workspace${mode === "home" ? " access-home" : ""}${setup ? " access-setup" : ""}`}>
          {setup && <aside className="access-rail" aria-label="Langkah penyiapan">
            <h2>{text("Sebelum mulai.", "Before you start.")}</h2><p>{text("Siapkan perangkat, lalu mulai melayani.", "Set up the device, then start serving.")}</p>
            <ol><li aria-current="step"><span>1</span><div><strong>{text("Siapkan perangkat", "Set up the device")}</strong><small>{text("Dilakukan oleh pemilik", "Completed by the owner")}</small></div></li><li><span>2</span><div><strong>{text("Masuk dengan PIN", "Sign in with a PIN")}</strong><small>{text("Untuk setiap karyawan", "For every employee")}</small></div></li></ol>
          </aside>}
          {mode === "home" ? children : <section className="access-card" aria-labelledby="access-title">{children}</section>}
        </div>
      </main>
      <footer className="access-footer"><span><AccessIcon name="lock" />{text("Akses sesuai peran.", "Access by role.")}</span><span>BnB · Bites and Blends</span></footer>
    </div>
  );
}

export function DeviceIllustration() {
  return <div className="access-visual" aria-hidden="true"><div className="access-device-art"><div className="access-device-screen">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div><span className="access-art-lock"><AccessIcon name="lock" /></span></div></div>;
}
