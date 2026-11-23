"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type { DeviceTrustStatus } from "@/modules/device-trust/policy";
import { useOwnerLanguage } from "./owner-language";
import "./device-trust-reminder.css";

export function DeviceTrustReminder({ onSettings }: { onSettings: () => void }) {
  const { language, t } = useOwnerLanguage();
  const [status, setStatus] = useState<DeviceTrustStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const next = await api<DeviceTrustStatus>("/api/owner/device", undefined, {
        signal,
        background: true,
      });
      if (!signal.aborted) {
        setStatus(next);
        setUnavailable(false);
      }
    } catch {
      if (!signal.aborted) setUnavailable(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useAutoRefresh(load);
  const connected = status?.state === "connected";
  const warning =
    !unavailable && status && (!connected || status.daysRemaining <= 7);
  const expiry = status?.expiresAt
    ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(status.expiresAt))
    : null;
  return (
    <section
      className={`device-trust-reminder${warning ? " is-warning" : ""}`}
      aria-label={t("Koneksi perangkat kasir")}
      data-testid="device-trust-reminder"
    >
      <div>
        <strong>{t("Perangkat kasir toko")}</strong>
        <p role="status">
          {unavailable
            ? t("Status perangkat belum dapat diperiksa.")
            : !status
              ? t("Memeriksa koneksi perangkat…")
              : connected
                ? language === "en"
                  ? `Connected · ${status.daysRemaining} ${status.daysRemaining === 1 ? "day" : "days"} remaining`
                  : `Terhubung · Sisa ${status.daysRemaining} hari`
                : t(
                    status.state === "expired"
                      ? "Koneksi perangkat telah berakhir."
                      : "Belum ada perangkat terhubung.",
                  )}
          {!unavailable && expiry && (
            <span className="device-trust-expiry">
              {" · "}{t("Berlaku sampai")}: {expiry} WIB
            </span>
          )}
        </p>
      </div>
      <button
        className="secondary"
        type="button"
        onClick={onSettings}
        title={t(
          "Hubungkan ulang hanya pada browser kasir toko. Browser kasir sebelumnya akan terputus.",
        )}
      >
        {t("Kelola perangkat")}
      </button>
    </section>
  );
}
