"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
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
export function Reports() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Data>("/api/owner/report")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  async function load(
    from: string,
    to: string,
    salesPage = 1,
    attendancePage = 1,
  ) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<Data>(
          `/api/owner/report?${new URLSearchParams({ from, to, salesPage: String(salesPage), attendancePage: String(attendancePage) })}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" aria-busy={busy}>
      <section className="report-top">
        <div>
          <h2>Cerita kafe hari ini.</h2>
          <p className="muted">
            Penjualan yang dicatat kasir. Waktu Indonesia Barat.
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
            <label htmlFor="date-from">Dari tanggal</label>
            <input
              id="date-from"
              name="from"
              type="date"
              defaultValue={businessToday()}
              required
            />
          </div>
          <div>
            <label htmlFor="date-to">Sampai tanggal</label>
            <input
              id="date-to"
              name="to"
              type="date"
              defaultValue={businessToday()}
              required
            />
          </div>
          <button disabled={busy}>Tampilkan</button>
        </form>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error
            ? "Laporan belum tersedia. Coba Tampilkan lagi."
            : "Memuat laporan…"}
        </p>
      ) : (
        <>
          <div className="summary-grid">
            <section className="revenue-panel">
              <p>Pendapatan tercatat</p>
              <strong data-testid="revenue">
                {rupiah(data.summary.revenue)}
              </strong>
              <p>
                {data.from} sampai {data.to}
              </p>
            </section>
            <section className="card stack">
              <h3>Penjualan selesai</h3>
              <strong className="summary-count" data-testid="sales-count">
                {data.summary.salesCount}
              </strong>
              <p className="muted">
                Pesanan yang sudah dibayar dan diselesaikan.
              </p>
            </section>
            <section className="card stack">
              <h3>Pembayaran</h3>
              {(["qris", "cash"] as const).map((method) => {
                const p = data.payments.find((p) => p.method === method);
                return (
                  <div className="row between" key={method}>
                    <span>
                      {method === "qris" ? "QRIS" : "Tunai"}{" "}
                      <small>({p?.count ?? 0})</small>
                    </span>
                    <strong>{rupiah(p?.total ?? 0)}</strong>
                  </div>
                );
              })}
              <small>Belum direkonsiliasi dengan penyedia pembayaran.</small>
            </section>
          </div>
          {!!data.open.length && (
            <section className="payment-note">
              <h3>Transaksi belum selesai</h3>
              {data.open.map((s) => (
                <p key={s.id}>
                  <strong>{s.cashierName}</strong>: {rupiah(s.total)} —{" "}
                  {s.status === "paid"
                    ? "penerimaan pembayaran sudah dicatat; perlu Selesai"
                    : "menunggu konfirmasi pembayaran"}
                  . <span className="reference">{s.reference}</span>
                </p>
              ))}
              <p>
                Belum masuk pendapatan. Buka Kasir dan minta kasir asal
                memasukkan PIN untuk melanjutkan.
              </p>
            </section>
          )}
          <div className="report-grid">
            <section className="card stack">
              <h2>Menu terjual</h2>
              {data.items.length ? (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      Jumlah dan pendapatan setiap menu
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Menu</th>
                        <th scope="col">Jumlah</th>
                        <th scope="col">Tercatat</th>
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
                  Belum ada menu terjual pada tanggal ini.
                </p>
              )}
            </section>
            <section className="card stack">
              <h2>Penjualan per karyawan</h2>
              {data.cashiers.length ? (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      Penjualan berdasarkan kasir
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Karyawan</th>
                        <th scope="col">Penjualan</th>
                        <th scope="col">Tercatat</th>
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
                <p className="muted">Belum ada penjualan pada tanggal ini.</p>
              )}
            </section>
          </div>
          <section className="card stack">
            <h2>Riwayat penjualan</h2>
            {data.history.length ? (
              data.history.map((s) => (
                <details className="sale-history" key={s.id}>
                  <summary>
                    <span>
                      <strong>{localTime(s.completedAt)}</strong>
                      <br />
                      <small>
                        {s.cashierName} ·{" "}
                        {s.paymentMethod === "qris" ? "QRIS" : "Tunai"}
                      </small>
                    </span>
                    <strong>{rupiah(s.total)}</strong>
                    <span className="details-label">Lihat item</span>
                  </summary>
                  <p className="reference">{s.reference}</p>
                  <div className="table-wrap">
                    <table>
                      <caption className="sr-only">
                        Rincian {s.reference}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Menu saat dijual</th>
                          <th scope="col">Harga</th>
                          <th scope="col">Jumlah</th>
                          <th scope="col">Subtotal</th>
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
                Belum ada penjualan selesai pada rentang ini.
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
            <h2>Kehadiran karyawan</h2>
            <p className="muted">
              Termasuk shift yang melewati tengah malam atau masih berlangsung.
            </p>
            {data.attendance.length ? (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    Shift yang bersinggungan dengan tanggal pilihan
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Karyawan</th>
                      <th scope="col">Mulai kerja</th>
                      <th scope="col">Selesai kerja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attendance.map((a) => (
                      <tr key={a.id}>
                        <th scope="row">{a.name}</th>
                        <td>{localTime(a.clockIn)}</td>
                        <td>
                          {a.clockOut ? (
                            localTime(a.clockOut)
                          ) : (
                            <span className="badge">Masih bekerja</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Tidak ada shift pada rentang ini.</p>
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
  label: string;
}) {
  return (
    <div className="row between">
      <small>
        {count} data {label} · Halaman {page} dari{" "}
        {Math.max(1, Math.ceil(count / 25))}
      </small>
      <div className="row">
        <button
          className="secondary"
          aria-label={`Halaman ${label} sebelumnya`}
          disabled={busy || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Sebelumnya
        </button>
        <button
          className="secondary"
          aria-label={`Halaman ${label} berikutnya`}
          disabled={busy || page * 25 >= count}
          onClick={() => onChange(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
