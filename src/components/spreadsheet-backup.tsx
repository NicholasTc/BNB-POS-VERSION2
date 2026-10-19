"use client";
import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { useOwnerLanguage } from "./owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { localTime } from "@/lib/dates";
type Status = {
  mode: "off" | "test" | "live" | "configuration";
  total: number;
  pending: number;
  failed: number;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  workerStale: boolean;
  error: string | null;
  liveSetupPending: boolean;
};
export function SpreadsheetBackup() {
  const { language, t } = useOwnerLanguage();
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const next = await api<Status>("/api/owner/sheets", undefined, {
        signal,
        background: true,
      });
      if (!signal.aborted) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (!signal.aborted) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useAutoRefresh(load, !busy);
  return (
    <section className="card stack" aria-label={t("Cadangan spreadsheet")}>
      <h2>{t("Cadangan spreadsheet")}</h2>
      <p className="muted">
        {t(
          "Salinan penjualan selesai dan kehadiran. Kasir tetap berjalan saat Google tidak tersedia.",
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {ownerMessage(error, language)}
        </p>
      )}
      {!data ? (
        <p role="status">{t("Memuat…")}</p>
      ) : (
        <>
          <p>
            <strong>
              {t(
                data.mode === "off"
                  ? "Sinkronisasi nonaktif"
                  : data.mode === "test"
                    ? "Mode pengujian"
                    : data.mode === "live"
                      ? "Sinkronisasi aktif"
                      : "Periksa konfigurasi sinkronisasi",
              )}
            </strong>
          </p>
          <p>
            {t("Menunggu sinkronisasi")}:{" "}
            <strong data-testid="sheets-pending">{data.pending}</strong> /{" "}
            {data.total}
          </p>
          <p>
            {t("Sinkronisasi terakhir")}:{" "}
            {data.lastSuccessAt
              ? localTime(data.lastSuccessAt, language)
              : t("Belum pernah")}
          </p>
          {data.workerStale && data.mode !== "off" && (
            <p className="muted">
              {t(
                "Worker belum memeriksa antrean baru-baru ini. Periksa proses sinkronisasi.",
              )}
            </p>
          )}
          {(data.error || data.failed > 0) && (
            <p role="status">
              {t(
                "Sinkronisasi tertunda. Periksa akses spreadsheet, koneksi, dan worker. Data POS tetap tersimpan.",
              )}
            </p>
          )}
          {data.liveSetupPending && (
            <p className="muted">
              {t(
                "Spreadsheet live sudah dipilih. Sinkronisasi produksi masih perlu diaktifkan.",
              )}
            </p>
          )}
          <button
            className="secondary"
            disabled={
              busy ||
              data.mode === "off" ||
              data.mode === "configuration" ||
              !data.pending
            }
            onClick={async () => {
              setBusy(true);
              setNotice(false);
              setError("");
              try {
                await api("/api/owner/sheets", { action: "retry" });
                setNotice(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("Menyimpan…") : t("Coba sinkronisasi lagi")}
          </button>
          {notice && (
            <p role="status">{t("Antrean siap dicoba kembali oleh worker.")}</p>
          )}
        </>
      )}
    </section>
  );
}
