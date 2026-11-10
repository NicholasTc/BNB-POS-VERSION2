"use client";
import { useState } from "react";
import { useOwnerLanguage } from "./owner-language";
import { Modal } from "./modal";
import { useOwnerAlerts } from "@/modules/alerts/use-alerts";
import { alertCopy } from "@/modules/alerts/copy";
import type { AlertDestination } from "@/modules/alerts/types";
import "./owner-alerts.css";
export function OwnerAlerts({
  onNavigate,
}: {
  onNavigate: (destination: AlertDestination) => void;
}) {
  const { language } = useOwnerLanguage(),
    t = (id: string, en: string) => (language === "en" ? en : id);
  const { data, error, busy, confirmed, manage, refresh } =
    useOwnerAlerts(true);
  const [open, setOpen] = useState(false),
    [hidden, setHidden] = useState(false);
  const visible = data?.items.filter((a) => a.hidden === hidden) ?? [];
  const clearable =
    data?.items.filter((a) => !a.hidden && a.severity === "info") ?? [];
  return (
    <div className="owner-alerts">
      <button
        type="button"
        className={`secondary owner-alert-bell ${data?.urgentCount ? "urgent" : ""}`}
        aria-label={
          t("Peringatan", "Alerts") +
          ` (${error ? "!" : (data?.visibleCount ?? "…")})`
        }
        aria-haspopup="dialog"
        onClick={() => {
          setHidden(false);
          setOpen(true);
          void refresh();
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        <span className="owner-alert-bell-label">
          {t("Peringatan", "Alerts")}
        </span>
        <span className="owner-alert-count" aria-hidden="true">
          {error ? "!" : (data?.visibleCount ?? "…")}
        </span>
      </button>
      {open && (
        <Modal
          title={t("Perlu perhatian", "Needs attention")}
          className="owner-alert-dialog"
          closeLabel={t("Tutup", "Close")}
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            {t(
              "Peringatan hilang saat masalah diperbaiki. Menghapus atau menunda pengingat tidak mengubah data POS.",
              "Alerts resolve when issues are fixed. Clearing or snoozing a reminder does not change POS records.",
            )}
          </p>
          <div
            className="owner-alert-tabs"
            role="group"
            aria-label={t("Daftar peringatan", "Alert lists")}
          >
            <button
              className="secondary"
              aria-pressed={!hidden}
              onClick={() => setHidden(false)}
            >
              {t("Aktif", "Active")} ({data?.visibleCount ?? "…"})
            </button>
            <button
              className="secondary"
              aria-pressed={hidden}
              onClick={() => setHidden(true)}
            >
              {t("Disembunyikan", "Hidden")} (
              {data?.items.filter((a) => a.hidden).length ?? "…"})
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {t("Perbarui", "Refresh")}
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {t(
                "Daftar peringatan belum dapat dikonfirmasi. Perbarui untuk memeriksa status terbaru; perubahan mungkin sudah tersimpan.",
                "Alerts could not be confirmed. Refresh to check their latest status; your change may already be saved.",
              )}
            </div>
          )}
          {confirmed && !error && (
            <p className="success" role="status">
              {t("Pengingat diperbarui.", "Reminders updated.")}
            </p>
          )}
          {!data && !error && (
            <p role="status">{t("Memuat peringatan…", "Loading alerts…")}</p>
          )}
          {!!data && !error && !visible.length && (
            <p className="owner-alert-empty">
              {hidden
                ? t(
                    "Tidak ada pengingat yang disembunyikan.",
                    "No hidden reminders.",
                  )
                : t(
                    "Tidak ada yang perlu ditindaklanjuti saat ini.",
                    "Nothing needs attention right now.",
                  )}
            </p>
          )}
          <ul className="owner-alert-list">
            {visible.map((alert) => {
              const copy = alertCopy(alert, language);
              const command = (
                action: "dismiss" | "snooze" | "acknowledge" | "restore",
              ) =>
                void manage({
                  action,
                  targets: [{ key: alert.key, version: alert.version }],
                });
              return (
                <li
                  key={alert.key}
                  className={`owner-alert-card ${alert.severity}`}
                >
                  <span className="owner-alert-priority">
                    {alert.severity === "urgent"
                      ? t("Penting", "Urgent")
                      : alert.severity === "warning"
                        ? t("Perlu diperiksa", "Review")
                        : t("Pengingat", "Reminder")}
                  </span>
                  <h3>{copy.title}</h3>
                  <p>{copy.description}</p>
                  {alert.disposition === "acknowledged" && (
                    <small>
                      {t(
                        "Sudah dilihat · tetap aktif sampai masalah selesai.",
                        "Acknowledged · remains active until resolved.",
                      )}
                    </small>
                  )}
                  {alert.snoozedUntil && (
                    <small>
                      {t("Diingatkan kembali", "Reminder resumes")}{" "}
                      {new Date(alert.snoozedUntil).toLocaleString(
                        language === "en" ? "en-GB" : "id-ID",
                        { timeZone: "Asia/Jakarta" },
                      )}{" "}
                      WIB
                    </small>
                  )}
                  <div className="owner-alert-actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        setOpen(false);
                        onNavigate(alert.destination);
                      }}
                    >
                      {alert.destination === "menu"
                        ? t("Atur kategori", "Manage categories")
                        : alert.destination === "stock"
                          ? t("Periksa stok", "Review stock")
                          : alert.destination === "device"
                            ? t("Status spreadsheet", "Spreadsheet status")
                            : t("Periksa transaksi", "Review transactions")}
                    </button>
                    {hidden ? (
                      <button
                        className="secondary"
                        disabled={busy || !!error}
                        onClick={() => command("restore")}
                      >
                        {t("Tampilkan kembali", "Show again")}
                      </button>
                    ) : (
                      <>
                        {alert.severity === "info" && (
                          <button
                            className="text-button"
                            disabled={busy || !!error}
                            onClick={() => command("dismiss")}
                          >
                            {t("Hapus pengingat", "Clear reminder")}
                          </button>
                        )}
                        {alert.severity !== "urgent" && (
                          <button
                            className="secondary"
                            disabled={busy || !!error}
                            onClick={() => command("snooze")}
                          >
                            {t("Ingatkan 1 jam lagi", "Remind in 1 hour")}
                          </button>
                        )}
                        {alert.severity === "urgent" &&
                          alert.disposition !== "acknowledged" && (
                            <button
                              className="secondary"
                              disabled={busy || !!error}
                              onClick={() => command("acknowledge")}
                            >
                              {t("Sudah saya lihat", "Acknowledge")}
                            </button>
                          )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!hidden && (
            <button
              className="secondary"
              disabled={busy || !!error || !clearable.length}
              onClick={() =>
                void manage({
                  action: "clear",
                  targets: clearable.map((a) => ({
                    key: a.key,
                    version: a.version,
                  })),
                })
              }
            >
              {busy
                ? t("Menyimpan…", "Saving…")
                : t(
                    "Hapus semua pengingat biasa",
                    "Clear all informational reminders",
                  )}
            </button>
          )}
          {data && (
            <small className="muted">
              {t("Diperiksa", "Checked")}{" "}
              {new Date(data.observedAt).toLocaleTimeString(
                language === "en" ? "en-GB" : "id-ID",
                { timeZone: "Asia/Jakarta" },
              )}{" "}
              WIB ·{" "}
              {t(
                "Diperbarui otomatis saat halaman aktif.",
                "Updates automatically while this page is active.",
              )}
            </small>
          )}
        </Modal>
      )}
    </div>
  );
}
