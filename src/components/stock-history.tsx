"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { ownerMessage } from "@/lib/owner-language";
import type { StockHistory, StockItem } from "@/modules/stock/types";
import { useStockText } from "./stock-shared";
export function StockHistoryView({
  items,
  active,
}: {
  items: StockItem[];
  active: boolean;
}) {
  const { t, language, number } = useStockText();
  const [filter, setFilter] = useState(""),
    [cursors, setCursors] = useState<string[]>([]),
    [data, setData] = useState<StockHistory | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const request = useRef(0),
    cursor = cursors.at(-1);
  const url = `/api/owner/stock?${new URLSearchParams({ view: "history", ...(filter ? { stockItemId: filter } : {}), ...(cursor ? { cursor } : {}) })}`;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(),
      version = ++request.current;
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return;
        setLoading(true);
        return api<StockHistory>(url, undefined, { signal: controller.signal });
      })
      .then((result) => {
        if (
          result &&
          !controller.signal.aborted &&
          version === request.current
        ) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && version === request.current)
          setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted && version === request.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [url, active]);
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const version = request.current;
      try {
        const result = await api<StockHistory>(url, undefined, {
          signal,
          background: true,
        });
        if (!signal.aborted && version === request.current) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!signal.aborted && version === request.current)
          setError((e as Error).message);
      }
    },
    [url],
  );
  useAutoRefresh(refresh, active && !cursor && !loading);
  return (
    <section className="card stack">
      <h3>{t("Riwayat stok", "Stock history")}</h3>
      <div>
        <label htmlFor="stock-history-filter">{t("Barang", "Item")}</label>
        <select
          id="stock-history-filter"
          value={filter}
          onChange={(e) => {
            setLoading(true);
            setFilter(e.target.value);
            setCursors([]);
          }}
        >
          <option value="">{t("Semua barang", "All items")}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="error" role="alert">
          {ownerMessage(error, language)}
        </p>
      )}
      {loading && <p role="status">{t("Memuat…", "Loading…")}</p>}
      {!loading && !data?.rows.length && (
        <p>{t("Belum ada pergerakan stok.", "No stock movements yet.")}</p>
      )}
      <ul className="stock-history-list">
        {data?.rows.map((m) => (
          <li key={m.id}>
            <div className="row between">
              <strong>{m.name}</strong>
              <strong className={m.delta < 0 ? "stock-out" : "stock-in"}>
                {m.delta > 0 ? "+" : ""}
                {number(m.delta)} {m.unit}
              </strong>
            </div>
            <p>
              {m.kind === "opening"
                ? t("Stok awal", "Opening stock")
                : m.kind === "restock"
                  ? t("Barang datang", "Stock received")
                  : m.kind === "adjust"
                    ? t("Penyesuaian fisik", "Physical adjustment")
                    : t("Penjualan", "Sale")}{" "}
              · {m.actor === "owner" ? t("Pemilik", "Owner") : m.actor}
            </p>
            <small>
              {new Date(m.createdAt).toLocaleString(
                language === "en" ? "en-GB" : "id-ID",
                { timeZone: "Asia/Jakarta" },
              )}{" "}
              WIB · {t("Sisa setelah perubahan", "Balance after change")}:{" "}
              {number(m.balanceAfter)} {m.unit}
            </small>
            {m.reason && <p>{m.reason}</p>}
            {m.saleReference && (
              <details>
                <summary>{t("Referensi penjualan", "Sale reference")}</summary>
                <p className="reference">{m.saleReference}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="row between">
        <small>
          {t("Halaman", "Page")} {cursors.length + 1}
        </small>
        <div className="row">
          <button
            className="secondary"
            disabled={loading || !cursors.length}
            onClick={() => {
              setLoading(true);
              setCursors((c) => c.slice(0, -1));
            }}
          >
            {t("Sebelumnya", "Previous")}
          </button>
          <button
            className="secondary"
            disabled={loading || !data?.nextCursor}
            onClick={() => {
              setLoading(true);
              setCursors((c) => [...c, data!.nextCursor!]);
            }}
          >
            {t("Berikutnya", "Next")}
          </button>
        </div>
      </div>
    </section>
  );
}
