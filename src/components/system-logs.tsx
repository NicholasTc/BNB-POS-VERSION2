"use client";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { diagnosticCopy, technicalHint } from "@/modules/diagnostics/copy";
import type { DiagnosticDetail, DiagnosticFeed } from "@/modules/diagnostics/types";
import { useOwnerLanguage } from "./owner-language";
import "./system-logs.css";

/** Admin-only investigation UI: filtered groups → one explanation → retained safe evidence. */
export function SystemLogs({ enabled }: { enabled: boolean }) {
  const { language } = useOwnerLanguage();
  const t = (id: string, en: string) => language === "en" ? en : id;
  const initial = { state: "open", source: "all", severity: "all", days: "7", reference: "", page: "1" };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [feed, setFeed] = useState<DiagnosticFeed | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiagnosticDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const query = new URLSearchParams(filters).toString();
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await adminApi<DiagnosticFeed>("/api/admin/logs?" + query, undefined, { signal, background: true });
      if (!signal?.aborted) { setFeed(next); setError(""); }
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    }
  }, [query]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [enabled, load, filters, refreshVersion]);
  useAutoRefresh(load, enabled && !selected && !busy);
  const loadDetail = useCallback(async (signal?: AbortSignal) => {
    if (!selected) return;
    try {
      const next = await adminApi<DiagnosticDetail>("/api/admin/logs?id=" + selected, undefined, { signal, background: true });
      if (!signal?.aborted) { setDetail(next); setError(""); }
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    }
  }, [selected]);
  useEffect(() => {
    if (!enabled || !selected) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => loadDetail(controller.signal));
    return () => controller.abort();
  }, [enabled, selected, loadDetail, refreshVersion]);
  const time = (value: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) + " WIB";

  /** Download only the selected server-sanitized report; never inspect browser storage or form inputs. */
  async function download() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const report = await adminApi("/api/admin/logs?id=" + selected + "&download=yes");
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `lisi-diagnostic-${selected}.json`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  /** Acknowledge the inspected revision only; a new fault requires a fresh inspection. */
  async function resolve() {
    if (!detail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi("/api/admin/logs", { action: "resolve", id: detail.issue.id, revision: detail.issue.revision });
      setSelected(null); setDetail(null);
      setNotice(t("Ditandai selesai. Kejadian baru akan membukanya kembali.", "Marked resolved. A new occurrence will reopen it."));
      await load();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="system-logs stack" aria-label={t("Log sistem", "System logs")}>
      <div className="diagnostic-heading">
        <div><h2>{t("Log sistem", "System logs")}</h2><p className="muted">{t("Pilih masalah untuk melihat apa yang terjadi dan langkah pemeriksaannya.", "Choose an issue to see what happened and where to start investigating.")}</p></div>
        <button className="secondary" disabled={busy} onClick={() => setRefreshVersion(value => value + 1)}>{t("Perbarui", "Refresh")}</button>
      </div>
      <p className="diagnostic-policy">{t("Referensi kejadian disimpan hingga 30 hari. Masalah aktif menampilkan jumlah sejak pertama tercatat. Laporan browser perlu diverifikasi; log bukan bukti transaksi hilang.", "Occurrence references are retained for up to 30 days. Active groups show counts since first seen. Browser reports need verification; logs are not proof of lost transactions.")}</p>
      {feed?.captureEnabled === false && <p role="status" className="error">{t("Pencatatan dinonaktifkan. Riwayat yang masih tersimpan tetap dapat dibaca.", "Collection is disabled. Existing retained history remains readable.")}</p>}
      <form className="diagnostic-filters" onSubmit={event => {
        event.preventDefault(); setFeed(null); setDetail(null); setSelected(null); setError(""); setNotice("");
        setFilters({ ...draft, page: "1" });
      }}>
        <label htmlFor="diagnostic-state">{t("Status", "Status")}<select id="diagnostic-state" value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value })}><option value="open">{t("Perlu diperiksa", "Open")}</option><option value="resolved">{t("Selesai", "Resolved")}</option><option value="all">{t("Semua", "All")}</option></select></label>
        <label htmlFor="diagnostic-source">{t("Sumber", "Source")}<select id="diagnostic-source" value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })}><option value="all">{t("Semua sumber", "All sources")}</option><option value="server">Server</option><option value="browser">Browser</option><option value="worker">Spreadsheet worker</option></select></label>
        <label htmlFor="diagnostic-severity">{t("Tingkat", "Severity")}<select id="diagnostic-severity" value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value })}><option value="all">{t("Semua tingkat", "All levels")}</option><option value="error">Error</option><option value="warning">Warning</option></select></label>
        <label htmlFor="diagnostic-days">{t("Periode", "Period")}<select id="diagnostic-days" value={draft.days} onChange={e => setDraft({ ...draft, days: e.target.value })}><option value="1">24 {t("jam", "hours")}</option><option value="7">7 {t("hari", "days")}</option><option value="30">30 {t("hari", "days")}</option></select></label>
        <label className="diagnostic-reference" htmlFor="diagnostic-reference">{t("Cari referensi", "Find reference")}<input id="diagnostic-reference" value={draft.reference} maxLength={36} placeholder="UUID" onChange={e => setDraft({ ...draft, reference: e.target.value.trim() })} /></label>
        <button disabled={busy}>{t("Terapkan filter", "Apply filters")}</button>
      </form>
      {error && <div role="alert" className="error"><p>{error}</p><p>{t("Daftar belum dapat dipastikan. Periksa koneksi atau migrasi database; gunakan Railway logs jika aplikasi/database bermasalah.", "The list could not be verified. Check connectivity or database migrations; use Railway logs during app/database outages.")}</p></div>}
      {notice && <p role="status">{notice}</p>}
      {!feed && !error && <p role="status">{t("Memuat log…", "Loading logs…")}</p>}
      <div className={`diagnostic-workspace${selected ? " has-selection" : ""}`}>
        <div className="diagnostic-list">
          {feed && !feed.items.length && !error && <div className="card"><h3>{t("Tidak ada masalah yang cocok", "No matching issues")}</h3><p>{t("Coba periode, status, atau referensi lain. Ini hanya menunjukkan laporan yang berhasil diterima, bukan jaminan tidak ada gangguan.", "Try another period, status or reference. This shows successfully received reports; it does not guarantee no failures occurred.")}</p></div>}
          {feed?.items.map(issue => <button key={issue.id} disabled={busy} className={`diagnostic-item ${issue.id === selected ? "is-selected" : ""}`} onClick={() => { setSelected(issue.id); setDetail(null); setError(""); setNotice(""); }} aria-pressed={issue.id === selected}>
            <span className={`diagnostic-severity ${issue.severity}`}>{issue.severity}</span>
            <strong>{diagnosticCopy[issue.kind].title}</strong>
            <span>{issue.source} · {issue.path}</span>
            <small>{issue.occurrences} {t("kejadian", "occurrences")} · {time(issue.lastSeenAt)}</small>
          </button>)}
          {feed && <div className="diagnostic-pagination"><button className="secondary" disabled={feed.page <= 1 || busy} onClick={() => { setSelected(null); setFeed(null); setFilters({ ...filters, page: String(feed.page - 1) }); }}>{t("Sebelumnya", "Previous")}</button><span>{t("Halaman", "Page")} {feed.page}</span><button className="secondary" disabled={!feed.hasMore || busy} onClick={() => { setSelected(null); setFeed(null); setFilters({ ...filters, page: String(feed.page + 1) }); }}>{t("Berikutnya", "Next")}</button></div>}
        </div>
        {selected && <div className="card diagnostic-detail">
          <button className="secondary diagnostic-back" onClick={() => { setSelected(null); setDetail(null); }}>{t("Kembali ke daftar", "Back to list")}</button>
          {!detail ? <p role="status">{t("Memuat rincian…", "Loading details…")}</p> : <>
            <span className={`diagnostic-severity ${detail.issue.severity}`}>{detail.issue.severity} · {detail.issue.state}</span>
            <h3>{diagnosticCopy[detail.issue.kind].title}</h3>
            <p>{diagnosticCopy[detail.issue.kind].meaning}</p>
            <dl className="diagnostic-facts"><dt>{t("Lokasi", "Where")}</dt><dd>{detail.issue.method} {detail.issue.path}</dd><dt>{t("Terakhir terjadi", "Last seen")}</dt><dd>{time(detail.issue.lastSeenAt)}</dd><dt>{t("Pertama tercatat", "First seen")}</dt><dd>{time(detail.issue.firstSeenAt)}</dd><dt>{t("Jumlah kejadian", "Occurrences")}</dt><dd>{detail.issue.occurrences}</dd><dt>{t("Versi aplikasi", "Release")}</dt><dd>{detail.issue.release}</dd><dt>{t("Referensi masalah", "Issue reference")}</dt><dd><code>{detail.issue.id}</code></dd></dl>
            <h4>{t("Mulai pemeriksaan di sini", "Start investigating here")}</h4><ol>{diagnosticCopy[detail.issue.kind].checks.map(check => <li key={check}>{check}</li>)}</ol>
            <details><summary>{t("Rincian teknis", "Technical details")}</summary><p><strong>{detail.issue.errorKind}</strong> · HTTP {detail.issue.httpStatus ?? "—"} · {detail.issue.technicalCode ?? "no recognized code"}</p><p>{technicalHint(detail.issue.technicalCode)}</p><pre>{detail.issue.frames.length ? detail.issue.frames.join("\n") : "No safe code location available. Check the matching Railway logs."}</pre><pre>{JSON.stringify(detail.issue, null, 2)}</pre></details>
            <details><summary>{t("Referensi kejadian terbaru", "Recent occurrence references")} ({detail.events.length}/{detail.sampleLimit})</summary><ul className="diagnostic-samples">{detail.events.map(event => <li key={event.id}><time>{time(event.at)}</time><code>{event.id}</code></li>)}</ul></details>
            <div className="row"><button className="secondary" disabled={busy} onClick={() => void download()}>{t("Unduh laporan", "Download report")}</button><button disabled={busy || detail.issue.state === "resolved"} onClick={() => void resolve()}>{t("Tandai selesai", "Mark resolved")}</button></div>
            <small className="muted">{t("Menandai selesai hanya merapikan daftar; tidak memperbaiki kode atau menghapus data bisnis. Kejadian baru membuka masalah ini kembali.", "Resolving organizes this list; it does not fix code or delete business data. A new occurrence reopens this issue.")}</small>
          </>}
        </div>}
      </div>
    </section>
  );
}
