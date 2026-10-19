"use client";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { rupiah } from "@/lib/money";
import { businessToday, localTime } from "@/lib/dates";
import { OwnerIcon, ownerViews, type OwnerView } from "./owner-navigation";
import { PosIcon } from "./pos-icons";
import { ProductPhoto } from "./product-photo";
import type { MenuProduct } from "@/lib/menu";
import { datePreset } from "@/lib/owner-dates";
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
export function Reports({
  view,
  onNavigate,
  products,
  staff,
  settings,
  device,
  initialSettingsTab = "menu",
}: {
  view: OwnerView;
  onNavigate: (view: OwnerView) => void;
  products: MenuProduct[];
  staff: ReactNode;
  settings: ReactNode;
  device: ReactNode;
  initialSettingsTab?: "menu" | "device";
}) {
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
  const [draft, setDraft] = useState({ from: initial.from, to: initial.to });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [staffTab, setStaffTab] = useState<"attendance" | "employees">(
    "attendance",
  );
  const [settingsTab, setSettingsTab] = useState<"menu" | "device">(
    initialSettingsTab,
  );
  const version = useRef(0);
  const manualError = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++version.current;
    api<Data>(reportUrl(query), undefined, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || request !== version.current) return;
        setData(result);
        setUpdatedAt(new Date().toISOString());
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
          setUpdatedAt(new Date().toISOString());
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
  const title = ownerViews.find((item) => item.id === view)!.label;
  const today = businessToday();
  function preset(value: "today" | "yesterday" | "week") {
    const dates = datePreset(value, today);
    setDraft(dates);
    load(dates.from, dates.to);
  }
  const pending = !!data?.open.length;
  return (
    <div className="owner-reports" aria-busy={busy}>
      <div className="owner-page-heading">
        <h1 id="owner-view-title" tabIndex={-1}>
          {t(title)}
        </h1>
        {view !== "settings" && (
          <small className="owner-updated">
            {updatedAt && (
              <>
                {t("Terakhir diperbarui")} {localTime(updatedAt, language)}
              </>
            )}
          </small>
        )}
      </div>
      <div className="owner-report-toolbar" hidden={view === "settings"}>
        <div
          className="owner-quick-dates"
          role="group"
          aria-label={t("Rentang tanggal")}
        >
          {(
            [
              ["today", "Hari ini"],
              ["yesterday", "Kemarin"],
              ["week", "7 hari"],
            ] as const
          ).map(([id, label]) => {
            const range = datePreset(id, today);
            return (
              <button
                className="secondary"
                key={id}
                disabled={busy}
                aria-pressed={
                  applied.from === range.from && applied.to === range.to
                }
                onClick={() => preset(id)}
              >
                {t(label)}
              </button>
            );
          })}
          <details className="owner-date-picker">
            <summary>
              <OwnerIcon name="calendar" />
              <span>{t("Pilih tanggal")}</span>
            </summary>
            <form
              className="row date-filter"
              onSubmit={(e) => {
                e.preventDefault();
                load(draft.from, draft.to);
              }}
            >
              <div>
                <label htmlFor="date-from">{t("Dari tanggal")}</label>
                <input
                  id="date-from"
                  name="from"
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="date-to">{t("Sampai tanggal")}</label>
                <input
                  id="date-to"
                  name="to"
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  required
                />
              </div>
              <button disabled={busy}>
                {busy ? t("Memuat…") : t("Tampilkan")}
              </button>
            </form>
          </details>
        </div>
        <div className="owner-range">
          <span>
            {applied.from} {t("sampai")} {applied.to}
          </span>
          <small>{t("Waktu Indonesia Barat")}</small>
        </div>
        <p className={`sync-note ${stale ? "is-stale" : ""}`} role="status">
          {stale
            ? t("Pembaruan otomatis tertunda. Data terakhir tetap ditampilkan.")
            : t("Pembaruan otomatis aktif.")}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {ownerMessage(error, language)}
        </p>
      )}
      {!data && view !== "settings" && (
        <p role="status">
          {error
            ? t("Laporan belum tersedia. Coba Tampilkan lagi.")
            : t("Memuat laporan…")}
        </p>
      )}
      <section
        id="owner-summary"
        aria-label={t("Ringkasan")}
        hidden={view !== "summary"}
      >
        {data && (
          <div className="owner-panel-stack">
            <div className="owner-metrics">
              <section className="owner-metric owner-revenue">
                <h2>{t("Total penjualan")}</h2>
                <strong data-testid="revenue">
                  {rupiah(data.summary.revenue)}
                </strong>
              </section>
              <section className="owner-metric">
                <h2>{t("Transaksi")}</h2>
                <strong data-testid="sales-count">
                  {data.summary.salesCount}
                </strong>
              </section>
              <section className="owner-metric">
                <h2>{t("Item terjual")}</h2>
                <strong data-testid="items-count">
                  {data.items.reduce((n, item) => n + item.quantity, 0)}
                </strong>
              </section>
            </div>
            {pending && (
              <div className="owner-unfinished row between">
                <span>
                  <strong>
                    {data.open.length} {t("Transaksi belum selesai")}
                  </strong>{" "}
                  · {t("Belum masuk pendapatan.")}
                </span>
                <button
                  className="text-button"
                  onClick={() => onNavigate("transactions")}
                >
                  {t("Lihat rincian")}
                </button>
              </div>
            )}
            <div className="owner-overview-grid">
              <section className="owner-card">
                <h2>{t("Pembayaran")}</h2>
                <p className="owner-caption">
                  {t("Berdasarkan catatan kasir.")}
                </p>
                <div className="owner-payment-list">
                  {(["qris", "cash"] as const).map((method) => {
                    const payment = data.payments.find(
                      (p) => p.method === method,
                    );
                    return (
                      <div className="owner-payment-row" key={method}>
                        <span className="owner-payment-icon">
                          <PosIcon name={method} />
                        </span>
                        <div>
                          <strong>
                            {method === "qris" ? "QRIS" : t("Tunai")}
                          </strong>
                          <small>
                            {payment?.count ?? 0} {t("transaksi")}
                          </small>
                        </div>
                        <strong>{rupiah(payment?.total ?? 0)}</strong>
                      </div>
                    );
                  })}
                </div>
                <small className="owner-payment-disclaimer">
                  {t("Belum direkonsiliasi dengan penyedia pembayaran.")}
                </small>
              </section>
              <section className="owner-card">
                <h2>{t("Menu terlaris")}</h2>
                {data.items.length ? (
                  <ol className="owner-bestsellers">
                    {data.items.slice(0, 3).map((item, i) => {
                      const product = products.find((p) => p.id === item.id);
                      return (
                        <li key={item.id}>
                          <span className="owner-rank">{i + 1}</span>
                          <ProductPhoto
                            imageUrl={product?.imageUrl ?? ""}
                            category={product?.category ?? "uncategorized"}
                          />
                          <div>
                            <strong>{item.name}</strong>
                            <small>
                              {item.quantity} {t("terjual")}
                            </small>
                          </div>
                          <strong>{rupiah(item.total)}</strong>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="muted">
                    {t("Belum ada menu terjual pada tanggal ini.")}
                  </p>
                )}
                <details className="owner-all-items">
                  <summary>{t("Lihat semua menu")}</summary>
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
                        {data.items.map((item) => (
                          <tr key={item.id}>
                            <th scope="row">{item.name}</th>
                            <td>{item.quantity}</td>
                            <td>{rupiah(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            </div>
            <section className="owner-card owner-recent">
              <div className="row between">
                <h2>
                  {data.salesPage === 1
                    ? t("Transaksi terbaru")
                    : t("Riwayat penjualan")}
                </h2>
                <button
                  className="text-button"
                  onClick={() => onNavigate("transactions")}
                >
                  {t("Lihat semua transaksi")}
                </button>
              </div>
              {data.history.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("Waktu")}</th>
                        <th scope="col">{t("Kasir")}</th>
                        <th scope="col">{t("Pembayaran")}</th>
                        <th scope="col">{t("Total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.slice(0, 3).map((sale) => (
                        <tr key={sale.id}>
                          <td>
                            {new Intl.DateTimeFormat(
                              language === "en" ? "en-GB" : "id-ID",
                              {
                                timeZone: "Asia/Jakarta",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            ).format(new Date(sale.completedAt))}
                          </td>
                          <td>{sale.cashierName}</td>
                          <td>
                            {sale.paymentMethod === "qris"
                              ? "QRIS"
                              : t("Tunai")}
                          </td>
                          <td>
                            <strong>{rupiah(sale.total)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">{t("Belum ada transaksi terbaru.")}</p>
              )}
            </section>
          </div>
        )}
      </section>
      <section
        id="owner-transactions"
        aria-label={t("Transaksi")}
        hidden={view !== "transactions"}
        className="owner-panel-stack"
      >
        {data && (
          <>
            <p className="owner-transactions-total">
              <strong>
                {data.summary.salesCount} {t("transaksi")}
              </strong>
              <span>{rupiah(data.summary.revenue)}</span>
            </p>{" "}
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
          </>
        )}
      </section>
      <section
        id="owner-staff"
        aria-label={t("Staf")}
        hidden={view !== "staff"}
        className="owner-panel-stack"
      >
        <div
          className="owner-subnav"
          role="group"
          aria-label={t("Bagian staf")}
        >
          <button
            aria-pressed={staffTab === "attendance"}
            onClick={() => setStaffTab("attendance")}
          >
            {t("Kehadiran & penjualan")}
          </button>
          <button
            aria-pressed={staffTab === "employees"}
            onClick={() => setStaffTab("employees")}
          >
            {t("Kelola staf")}
          </button>
        </div>
        <div hidden={staffTab !== "attendance"} className="owner-panel-stack">
          {data && (
            <>
              {" "}
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
                                <span className="badge">
                                  {t("Masih bekerja")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    {t("Tidak ada shift pada rentang ini.")}
                  </p>
                )}
                <Pagination
                  page={data.attendancePage}
                  count={data.attendanceCount}
                  busy={busy}
                  onChange={(p) =>
                    void load(data.from, data.to, data.salesPage, p)
                  }
                  label="kehadiran"
                />
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
            </>
          )}
        </div>
        <div hidden={staffTab !== "employees"}>{staff}</div>
      </section>
      <section
        id="owner-settings"
        aria-label={t("Pengaturan")}
        hidden={view !== "settings"}
        className="owner-panel-stack"
      >
        <div
          className="owner-subnav"
          role="group"
          aria-label={t("Bagian pengaturan")}
        >
          <button
            aria-pressed={settingsTab === "menu"}
            onClick={() => setSettingsTab("menu")}
          >
            {t("Menu kafe")}
          </button>
          <button
            aria-pressed={settingsTab === "device"}
            onClick={() => setSettingsTab("device")}
          >
            {t("Perangkat kasir")}
          </button>
        </div>
        <div hidden={settingsTab !== "menu"}>{settings}</div>
        <div hidden={settingsTab !== "device"}>{device}</div>
      </section>
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
