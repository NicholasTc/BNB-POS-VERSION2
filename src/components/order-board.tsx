"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type { OrderBoardState, OrderPage } from "@/modules/orders/types";
import type { PosState } from "./pos";
import "./orders.css";

const time = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function OrderBoard({ state }: { state: PosState }) {
  const [data, setData] = useState<OrderBoardState | null>(null);
  const [pendingPages, setPendingPages] = useState<string[]>([]);
  const [finishedPages, setFinishedPages] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const version = useRef(0);
  const enabled = !!state.cashier;
  const pendingAfter = pendingPages.at(-1),
    finishedBefore = finishedPages.at(-1);
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const current = ++version.current;
      const query = new URLSearchParams();
      if (pendingAfter) query.set("pendingAfter", pendingAfter);
      if (finishedBefore) query.set("finishedBefore", finishedBefore);
      try {
        const next = await api<OrderBoardState>(
          `/api/orders?${query}`,
          undefined,
          {
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
            background: true,
          },
        );
        if (!signal.aborted && current === version.current) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (signal.aborted || current !== version.current) return;
        if (e instanceof ApiError && e.status === 401) setData(null);
        setError(
          e instanceof ApiError
            ? e.message
            : "Daftar pesanan belum diperbarui. Periksa koneksi lalu coba lagi.",
        );
      }
    },
    [pendingAfter, finishedBefore],
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [enabled, refresh]);
  useAutoRefresh(refresh, enabled && !busy);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!enabled) return null;
  async function finish(id: string) {
    setBusy(id);
    setActionError("");
    setNotice("");
    // No automatic write retry: a lost reply is resolved by refreshing this
    // durable list, and an explicit same-order retry is idempotent server-side.
    try {
      await api(
        "/api/orders",
        { id, generation: state.generation },
        { signal: AbortSignal.timeout(10000) },
      );
      setNotice("Pesanan selesai. Terima kasih!");
      await refresh(new AbortController().signal);
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? e.message
          : "Status belum dikonfirmasi. Perbarui daftar sebelum mencoba lagi.",
      );
      await refresh(new AbortController().signal);
    } finally {
      setBusy(null);
    }
  }
  function list(value: OrderPage | undefined, finished: boolean) {
    const pages = finished ? finishedPages : pendingPages;
    const change = finished ? setFinishedPages : setPendingPages;
    return (
      <>
        {!value ? (
          <p className="muted" role="status">
            Memuat pesanan…
          </p>
        ) : value.orders.length ? (
          <ol className="preparation-list">
            {value.orders.map((order) => (
              <li
                key={order.id}
                className="preparation-order"
                data-testid={`order-${order.id}`}
              >
                <div className="preparation-order-main">
                  <div className="preparation-meta">
                    <strong>#{order.id.slice(0, 8).toUpperCase()}</strong>
                    <span>{time(order.receivedAt)}</span>
                    {order.carriedOver && (
                      <span className="badge">Dari sesi sebelumnya</span>
                    )}
                  </div>
                  <ul className="preparation-items">
                    {order.lines.map((line, i) => (
                      <li key={i}>
                        <span className="preparation-quantity">
                          {line.quantity}×
                        </span>
                        <strong>{line.name}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="muted">
                    Kasir: {order.cashierName}
                    {finished && (
                      <>
                        {" "}
                        · Diselesaikan {order.finishedByName},{" "}
                        {time(order.finishedAt!)}
                      </>
                    )}
                  </p>
                  <details className="preparation-reference">
                    <summary>Referensi transaksi</summary>
                    <span>{order.reference}</span>
                  </details>
                </div>
                {finished ? (
                  <span className="badge preparation-done">Selesai</span>
                ) : (
                  <button
                    disabled={!!busy || checking}
                    onClick={() => void finish(order.id)}
                    aria-label={`Selesai pesanan ${order.id.slice(0, 8).toUpperCase()}`}
                  >
                    {busy === order.id ? "Menandai…" : "Selesai"}
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="preparation-empty muted">
            {value && value.total > 0 && pages.length > 0
              ? "Tidak ada pesanan di halaman ini. Gunakan Sebelumnya untuk kembali."
              : finished
                ? "Pesanan yang selesai di sesi ini akan muncul di sini."
                : "Belum ada pesanan menunggu. Pesanan masuk otomatis setelah pembayaran tersimpan."}
          </p>
        )}
        {(pages.length > 0 || value?.nextCursor) && (
          <nav
            className="row between preparation-pages"
            aria-label={
              finished ? "Halaman pesanan selesai" : "Halaman pesanan disiapkan"
            }
          >
            <button
              className="secondary"
              disabled={!pages.length || !!busy}
              onClick={() => change(pages.slice(0, -1))}
            >
              Sebelumnya
            </button>
            <span className="muted">Halaman {pages.length + 1}</span>
            <button
              className="secondary"
              disabled={!value?.nextCursor || !!busy}
              onClick={() => change([...pages, value!.nextCursor!])}
            >
              Berikutnya
            </button>
          </nav>
        )}
      </>
    );
  }
  return (
    <div className="order-board stack" aria-label="Persiapan pesanan">
      <section
        className="card preparation-section"
        aria-labelledby="preparing-title"
      >
        <div className="row between preparation-heading">
          <div>
            <h2 id="preparing-title">
              Sedang disiapkan{" "}
              <span className="badge">{data?.pending.total ?? "…"}</span>
            </h2>
            <p className="muted">
              Pesanan sudah dibayar. Tandai selesai setelah siap disajikan.
            </p>
          </div>
          <button
            className="secondary"
            disabled={checking || !!busy}
            onClick={async () => {
              setChecking(true);
              setActionError("");
              try {
                await refresh(new AbortController().signal);
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? "Memeriksa…" : "Perbarui daftar"}
          </button>
        </div>
        {(error || actionError) && (
          <div className="error" role="alert">
            <p>{actionError || error}</p>
            {(pendingPages.length > 0 || finishedPages.length > 0) && (
              <button
                className="secondary"
                onClick={() => {
                  setPendingPages([]);
                  setFinishedPages([]);
                }}
              >
                Halaman pertama
              </button>
            )}
          </div>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {list(data?.pending, false)}
      </section>
      <section
        className="card preparation-section"
        aria-labelledby="finished-title"
      >
        <div className="preparation-heading">
          <h2 id="finished-title">
            Pesanan selesai{" "}
            <span className="badge">{data?.finished.total ?? "…"}</span>
          </h2>
          <p className="muted">
            Riwayat sesi kerja ini
            {data ? `, sejak ${time(data.session.openedAt)}` : ""}. Pesanan lama
            tetap tersimpan.
          </p>
        </div>
        {list(data?.finished, true)}
      </section>
    </div>
  );
}
