"use client";
import Link from "next/link";
import { useState, type ReactNode, type FormEvent } from "react";
import { AccessShell, AccessIcon } from "./access-shell";
import { useOwnerLanguage } from "./owner-language";

/** Same owner form/handler and field names; this component owns presentation only. */
export function OwnerLogin({ setup, loading, busy, error, tools, onSubmit }: {
  setup: boolean; loading: boolean; busy: boolean; error: string; tools: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { language } = useOwnerLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const text = (id: string, en: string) => language === "en" ? en : id;
  return <AccessShell mode={setup ? "cashier" : "owner"} tools={tools} setup={setup} busy={busy} language={language}>
    <Link className="access-back" href={setup ? "/?access=cashier" : "/"} aria-disabled={busy} onClick={e => { if (busy) e.preventDefault(); }}><AccessIcon name="back" />{text("Kembali", "Back")}</Link>
    <div className="access-state"><AccessIcon name="lock" />{setup ? text("Penyiapan oleh pemilik", "Owner setup") : text("Khusus pemilik", "Owners only")}</div>
    <h1 id="access-title">{text("Masuk sebagai pemilik.", "Owner sign-in.")}</h1>
    <p className="access-description">{setup ? text("Gunakan akun pemilik untuk melanjutkan.", "Use your owner account to continue.") : text("Buka laporan dan pengaturan kafe.", "Open café reports and settings.")}</p>
    {!setup && <p className="access-owner-note"><AccessIcon name="check" />{text("Bisa diakses dari perangkat pribadi. Tidak perlu menyiapkan kasir.", "Use your personal device. No cashier setup needed.")}</p>}
    {error && <p className="access-error" role="alert">{error}</p>}
    {loading ? <p role="status">{text("Memuat…", "Loading…")}</p> : <form onSubmit={onSubmit}>
      <div className="access-field"><label htmlFor="email">{text("Email pemilik", "Owner email")}</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy} /></div>
      <div className="access-field"><label htmlFor="password">{text("Kata sandi", "Password")}</label><div className="access-password"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} disabled={busy} /><button className="access-reveal" type="button" disabled={busy} aria-label={showPassword ? text("Sembunyikan kata sandi", "Hide password") : text("Tampilkan kata sandi", "Show password")} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><AccessIcon name="eye" /></button></div></div>
      <button className="access-primary" disabled={busy}>{busy ? text("Memeriksa…", "Checking…") : setup ? text("Lanjut", "Continue") : text("Masuk ke dasbor", "Sign in to dashboard")}</button>
    </form>}
  </AccessShell>;
}
