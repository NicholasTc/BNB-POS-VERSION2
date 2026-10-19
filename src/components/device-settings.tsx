"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
export function DeviceSettings() {
  const { language, t } = useOwnerLanguage();
  const [message, setMessage] = useState(""),
    [paired, setPaired] = useState(false),
    [busy, setBusy] = useState(false),
    [pendingAction, setPendingAction] = useState<"pair" | "revoke" | null>(
      null,
    );
  async function change(action: "pair" | "revoke") {
    if (
      !window.confirm(
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
          ? "Perangkat terhubung selama 30 hari. Buka Kasir untuk mulai."
          : "Akses perangkat diputus.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }
  return (
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
          {pendingAction === "revoke" ? t("Memutuskan…") : t("Putuskan akses")}
        </button>
      </div>
      {message && <p role="status">{ownerMessage(message, language)}</p>}
      {paired && (
        <Link className="button" href="/">
          {t("Lanjut ke Cashier login")}
        </Link>
      )}
    </section>
  );
}
