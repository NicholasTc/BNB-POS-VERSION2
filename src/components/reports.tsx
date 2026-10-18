"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { rupiah } from "@/lib/money";
import { businessToday, localTime } from "@/lib/dates";
import type { Report } from "@/modules/reporting";
// JSON dates arrive as ISO strings; the server's Date types are not client data.
type Data = Omit<Report, "history" | "attendance" | "open"> & {
  history: (Omit<Report["history"][number], "completedAt"> & {
    completedAt: string;
  })[];
  attendance: (Omit<Report["attendance"][number], "clockIn" | "clockOut"> & {
    clockIn: string;
    clockOut: string | null;
  })[];
  open: (Omit<Report["open"][number], "createdAt"> & { createdAt: string })[];
};
type Query = {
  from: string;
  to: string;
  salesPage: number;
  attendancePage: number;
};
const reportUrl = (q: Query) =>
  `/api/owner/report?${new URLSearchParams({ from: q.from, to: q.to, salesPage: String(q.salesPage), attendancePage: String(q.attendancePage) })}`;
export function Reports() {
  const { language, t } = useOwnerLanguage();
  const [initial] = useState<Query>(() => ({
    from: businessToday(),
    to: businessToday(),
    salesPage: 1,
    attendancePage: 1,
  }));
  const [query, setQuery] = useState(initial),
    [applied, setApplied] = useState(initial);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [stale, setStale] = useState(false);
  const version = useRef(0);
  const manualError = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++version.current;
    api<Data>(reportUrl(query), undefined, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || request !== version.current) return;
        setData(result);
        setApplied(query);
        setError("");
        manualError.current = false;
        setStale(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted && request === version.current)
          setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted && request === version.current)
          setBusy(false);
      });
    return () => controller.abort();
  }, [query]);
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const request = version.current;
      try {
        const result = await api<Data>(reportUrl(applied), undefined, {
          signal,
          background: true,
        });
        if (!signal.aborted && request === version.current) {
          setData(result);
          setStale(false);
          if (!manualError.current) setError("");
        }
      } catch (e) {
        if (!signal.aborted && request === version.current) {
          setStale(true);
          if (e instanceof ApiError && e.status === 401) setError(e.message);
        }
      }
    },
    [applied],
  );
  useAutoRefresh(refresh, !busy);
  function load(from: string, to: string, salesPage = 1, attendancePage = 1) {
    ++version.current;
    manualError.current = true;
    setBusy(true);
    setError("");
    setQuery({ from, to, salesPage, attendancePage });
  }
  return (
    <div className="stack" aria-busy={busy}>
      <section className="report-top">
        <div>
          <h2>{t("Cerita kafe hari ini.")}</h2>
          <p className="muted">
            {t("Penjualan yang dicatat kasir. Waktu Indonesia Barat.")}
          </p>
        </div>
        <form
          className="row date-filter"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void load(String(f.get("from")), String(f.get("to")));
          }}
        >
          <div>
            <label htmlFor="date-from">{t("Dari tanggal")}</label>
            <input
              id="date-from"
              name="from"
              type="date"
              defaultValue={businessToday()}
              required
            />
          </div>
          <div>
            <label htmlFor="date-to">{t("Sampai tanggal")}</label>
            <input
              id="date-to"
              name="to"
              type="date"
              defaultValue={businessToday()}
              required
            />
          </div>
          <button disabled={busy}>
            {busy ? t("Memuat…") : t("Tampilkan")}
          </button>
        </form>
      </section>
      <p className="sync-note" role="status">
        {stale
          ? t("Pembaruan otomatis tertunda. Data terakhir tetap ditampilkan.")
          : t("Pembaruan otomatis aktif.")}
      </p>
      {error && (
        <p className="error" role="alert">
          {ownerMessage(error, language)}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error
            ? t("Laporan belum tersedia. Coba Tampilkan lagi.")
            : t("Memuat laporan…")}
        </p>
      ) : (
        <>
          <div className="summary-grid">
            <section className="revenue-panel">
              <p>{t("Pendapatan tercatat")}</p>
              <strong data-testid="revenue">
                {rupiah(data.summary.revenue)}
              </strong>
              <p>
                {data.from} {t("sampai")} {data.to}
              </p>
            </section>
            <section className="card stack">
              <h3>{t("Penjualan selesai")}</h3>
              <strong className="summary-count" data-testid="sales-count">
                {data.summary.salesCount}
              </strong>
              <p className="muted">
                {t("Pesanan yang sudah dibayar dan diselesaikan.")}
              </p>
            </section>
            <section className="card stack">
              <h3>{t("Pembayaran")}</h3>
              {(["qris", "cash"] as const).map((method) => {
                const p = data.payments.find((p) => p.method === method);
                return (
                  <div className="row between" key={method}>
                    <span>
                      {method === "qris" ? "QRIS" : t("Tunai")}{" "}
                      <small>({p?.count ?? 0})</small>
                    </span>
                    <strong>{rupiah(p?.total ?? 0)}</strong>
                  </div>
                );
              })}
              <small>
                {t("Belum direkonsiliasi dengan penyedia pembayaran.")}
              </small>
            </section>
          </div>
          {!!data.open.length && (
            <section className="payment-note">
              <h3>{t("Transaksi belum selesai")}</h3>
              {data.open.map((s) => (
                <p key={s.id}>
                  <strong>{s.cashierName}</strong>: {rupiah(s.total)} —{" "}
                  {s.status === "paid"
                    ? t("penerimaan pembayaran sudah dicatat; perlu Selesai")
                    : t("menunggu konfirmasi pembayaran")}
                  . <span className="reference">{s.reference}</span>
                </p>
              ))}
              <p>
                {t(
                  "Belum masuk pendapatan. Buka Kasir dan minta kasir asal memasukkan PIN untuk melanjutkan.",
                )}
              </p>
            </section>
          )}
          <div className="report-grid">
            <section className="card stack">
              <h2>{t("Menu terjual")}</h2>
              {data.items.length ? (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      {t("Jumlah dan pendapatan setiap menu")}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("Menu")}</th>
                        <th scope="col">{t("Jumlah")}</th>
                        <th scope="col">{t("Tercatat")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((i) => (
                        <tr key={i.id}>
                          <th scope="row">{i.name}</th>
                          <td>{i.quantity}</td>
                          <td>{rupiah(i.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  {t("Belum ada menu terjual pada tanggal ini.")}
                </p>
              )}
            </section>
            <section className="card stack">
              <h2>{t("Penjualan per karyawan")}</h2>
              {data.cashiers.length ? (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      {t("Penjualan berdasarkan kasir")}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("Karyawan")}</th>
                        <th scope="col">{t("Penjualan")}</th>
                        <th scope="col">{t("Tercatat")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cashiers.map((c) => (
                        <tr key={c.id}>
                          <th scope="row">{c.name}</th>
                          <td>{c.count}</td>
                          <td>{rupiah(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  {t("Belum ada penjualan pada tanggal ini.")}
                </p>
              )}
            </section>
          </div>
          <section className="card stack">
            <h2>{t("Riwayat penjualan")}</h2>
            {data.history.length ? (
              data.history.map((s) => (
                <details className="sale-history" key={s.id}>
                  <summary>
                    <span>
                      <strong>{localTime(s.completedAt, language)}</strong>
                      <br />
                      <small>
                        {s.cashierName} ·{" "}
                        {s.paymentMethod === "qris" ? "QRIS" : t("Tunai")}
                      </small>
                    </span>
                    <strong>{rupiah(s.total)}</strong>
                    <span className="details-label">{t("Lihat item")}</span>
                  </summary>
                  <p className="reference">{s.reference}</p>
                  <div className="table-wrap">
                    <table>
                      <caption className="sr-only">
                        {t("Rincian")} {s.reference}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{t("Menu saat dijual")}</th>
                          <th scope="col">{t("Harga")}</th>
                          <th scope="col">{t("Jumlah")}</th>
                          <th scope="col">{t("Subtotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.lines.map((l, i) => (
                          <tr key={i}>
                            <th scope="row">{l.name}</th>
                            <td>{rupiah(l.unitPrice)}</td>
                            <td>{l.quantity}</td>
                            <td>{rupiah(l.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))
            ) : (
              <p className="muted">
                {t("Belum ada penjualan selesai pada rentang ini.")}
              </p>
            )}
            <Pagination
              page={data.salesPage}
              count={data.summary.salesCount}
              busy={busy}
              onChange={(p) =>
                void load(data.from, data.to, p, data.attendancePage)
              }
              label="penjualan"
            />
          </section>
          <section className="card stack">
            <h2>{t("Kehadiran karyawan")}</h2>
            <p className="muted">
              {t(
                "Termasuk shift yang melewati tengah malam atau masih berlangsung.",
              )}
            </p>
            {data.attendance.length ? (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    {t("Shift yang bersinggungan dengan tanggal pilihan")}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Karyawan")}</th>
                      <th scope="col">{t("Mulai kerja")}</th>
                      <th scope="col">{t("Selesai kerja")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attendance.map((a) => (
                      <tr key={a.id}>
                        <th scope="row">{a.name}</th>
                        <td>{localTime(a.clockIn, language)}</td>
                        <td>
                          {a.clockOut ? (
                            localTime(a.clockOut, language)
                          ) : (
                            <span className="badge">{t("Masih bekerja")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{t("Tidak ada shift pada rentang ini.")}</p>
            )}
            <Pagination
              page={data.attendancePage}
              count={data.attendanceCount}
              busy={busy}
              onChange={(p) => void load(data.from, data.to, data.salesPage, p)}
              label="kehadiran"
            />
          </section>
        </>
      )}
    </div>
  );
}
function Pagination({
  page,
  count,
  busy,
  onChange,
  label,
}: {
  page: number;
  count: number;
  busy: boolean;
  onChange: (page: number) => void;
  label: "penjualan" | "kehadiran";
}) {
  const { t, language } = useOwnerLanguage();
  return (
    <div className="row between">
      <small>
        {count}{" "}
        {language === "en"
          ? `${t(label)} ${t("data")}`
          : `${t("data")} ${t(label)}`}{" "}
        · {t("Halaman")} {page} {t("dari")} {Math.max(1, Math.ceil(count / 25))}
      </small>
      <div className="row">
        <button
          className="secondary"
          aria-label={`${t("Halaman")} ${t(label)} ${t("sebelumnya")}`}
          disabled={busy || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {t("Sebelumnya")}
        </button>
        <button
          className="secondary"
          aria-label={`${t("Halaman")} ${t(label)} ${t("berikutnya")}`}
          disabled={busy || page * 25 >= count}
          onClick={() => onChange(page + 1)}
        >
          {t("Berikutnya")}
        </button>
      </div>
    </div>
  );
}
