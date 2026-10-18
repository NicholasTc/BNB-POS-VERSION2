"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
export function DeviceSettings() {
  const { language, t } = useOwnerLanguage();
  const [message, setMessage] = useState(""),
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
    try {
      await api("/api/owner/device", { action });
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
          "Satu perangkat bersama. Menghubungkan ulang mencabut akses perangkat sebelumnya; shift tetap tercatat.",
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
    </section>
  );
}
