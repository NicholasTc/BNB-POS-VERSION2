"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { SpreadsheetBackup } from "./spreadsheet-backup";
import { AccessShell, AccessIcon, CASHIER_PATH, CASHIER_LOGIN_PATH } from "./access-shell";
export function DeviceSettings({ setupOnly = false, onCancel, onHome, leaveError, leaving = false }: {
  setupOnly?: boolean;
  onCancel?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onHome?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  leaveError?: string;
  leaving?: boolean;
} = {}) {
  const { language, t } = useOwnerLanguage();
  const [message, setMessage] = useState(""),
    [paired, setPaired] = useState(false),
    [busy, setBusy] = useState(false),
    [pendingAction, setPendingAction] = useState<"pair" | "revoke" | null>(
      null,
    );
  async function change(action: "pair" | "revoke", confirmInDialog = true) {
    if (
      confirmInDialog && !window.confirm(
        action === "pair"
          ? t(
              "Hubungkan perangkat ini? Perangkat lama akan terkunci dan kasir perlu memasukkan PIN kembali.",
            )
          : t("Putuskan akses perangkat kasir? Shift karyawan tetap tercatat."),
      )
    )
      return;
    setBusy(true);
    setPendingAction(action);
    setMessage("");
    setPaired(false);
    try {
      await api("/api/owner/device", { action });
      setPaired(action === "pair");
      setMessage(
        action === "pair"
          ? "Perangkat terhubung selama 90 hari. Buka Kasir untuk mulai."
          : "Akses perangkat diputus.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }
  if (setupOnly) {
    const text = (id: string, en: string) => language === "en" ? en : id;
    return <AccessShell setup={!paired} busy={busy || leaving} language={language} onHome={onHome}>
      {paired ? <>
        <div className="access-success-icon"><AccessIcon name="check" /></div>
        <h1 id="access-title">{text("Kasir siap dipakai.", "The cashier is ready.")}</h1>
        <p className="access-description">{text("Sekarang karyawan bisa masuk dengan PIN.", "Staff can now sign in with a PIN.")}</p>
        <Link className="access-primary" href={CASHIER_LOGIN_PATH}>{text("Lanjut ke PIN kasir", "Continue to cashier PIN")}</Link>
        <p className="access-security-note"><AccessIcon name="lock" />{text("Akun pemilik ditutup sebelum masuk kasir.", "Owner access is signed out before cashier entry.")}</p>
      </> : <>
        <Link href={CASHIER_PATH} className="access-back" onClick={e => { if (busy || leaving) e.preventDefault(); else onCancel?.(e); }} aria-disabled={busy || leaving}><AccessIcon name="back" />{text("Kembali", "Back")}</Link>
        <div className="access-state is-connected"><AccessIcon name="check" />{text("Pemilik terverifikasi", "Owner verified")}</div>
        <h1 id="access-title">{text("Jadikan ini perangkat kasir?", "Use this device as the cashier?")}</h1>
        <p className="access-description">{text("Karyawan akan masuk dengan PIN di browser ini.", "Staff will use their PIN in this browser.")}</p>
        <div className="access-device-info"><AccessIcon name="device" /><div><strong>{text("Browser ini", "This browser")}</strong><small>{text("Akses kasir berlaku 90 hari", "Cashier access lasts 90 days")}</small></div></div>
        <p className="access-warning">{text("Jika ada kasir di browser lain, aksesnya akan terputus.", "Any cashier access in another browser will be disconnected.")}</p>
        <p className="access-caption">{text("Penjualan dan absensi tetap tersimpan.", "Sales and attendance stay saved.")}</p>
        {(message || leaveError) && <p className="access-error" role="alert">{leaveError || ownerMessage(message, language)}</p>}
        <button className="access-primary" disabled={busy || leaving} onClick={() => void change("pair", false)}>{busy ? text("Menghubungkan…", "Connecting…") : text("Ya, hubungkan kasir", "Yes, connect cashier")}</button>
        <Link href={CASHIER_PATH} className="access-quiet access-recheck" aria-disabled={busy || leaving} onClick={e => { if (busy || leaving) e.preventDefault(); else onCancel?.(e); }}>{text("Batal", "Cancel")}</Link>
      </>}
    </AccessShell>;
  }
  return (
    <div className="stack">
      <section className="card stack">
        <h2>{t("Perangkat kasir")}</h2>
        <p className="muted">
          {t(
            "Dasbor pemilik dapat dibuka di perangkat apa pun dengan akun pemilik. Tidak perlu menghubungkan perangkat untuk membuka dasbor.",
          )}
        </p>
        <p className="muted">
          {t(
            "Hubungkan hanya browser yang akan dipakai sebagai kasir. Menghubungkan ulang mencabut akses kasir sebelumnya; penjualan dan shift tetap tersimpan.",
          )}
        </p>
        <div className="row">
          <button disabled={busy} onClick={() => void change("pair")}>
            {pendingAction === "pair"
              ? t("Menghubungkan…")
              : t("Hubungkan perangkat ini")}
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void change("revoke")}
          >
            {pendingAction === "revoke"
              ? t("Memutuskan…")
              : t("Putuskan akses")}
          </button>
        </div>
        {message && <p role="status">{ownerMessage(message, language)}</p>}
        {paired && (
          <Link className="button" href={CASHIER_PATH}>
            {t("Lanjut ke Cashier login")}
          </Link>
        )}
      </section>
      <SpreadsheetBackup />
    </div>
  );
}
