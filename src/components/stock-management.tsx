"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { ownerMessage } from "@/lib/owner-language";
import type { MenuProduct } from "@/lib/menu";
import type { StockData, StockItem } from "@/modules/stock/types";
import { useStockCommands } from "@/modules/stock/use-commands";
import { StockEditor, type StockEditorState } from "./stock-editor";
import { StockRecipeEditor } from "./stock-recipe";
import { StockHistoryView } from "./stock-history";
import { StockRecovery, useStockText } from "./stock-shared";
import "./stock.css";
export function StockManagement({
  products,
  active,
}: {
  products: MenuProduct[];
  active: boolean;
}) {
  const { t, language, number } = useStockText();
  const commands = useStockCommands(active);
  const [tab, setTab] = useState<"items" | "recipe" | "history">("items"),
    [data, setData] = useState<StockData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [lowOnly, setLowOnly] = useState(false),
    [editor, setEditor] = useState<StockEditorState | null>(null);
  const request = useRef(0);
  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    const version = ++request.current;
    try {
      const result = await api<StockData>("/api/owner/stock", undefined, {
        signal,
        background,
      });
      if (!signal?.aborted && version === request.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted && version === request.current)
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [active, load]);
  const refresh = useCallback(
    (signal: AbortSignal) => load(signal, true),
    [load],
  );
  useAutoRefresh(refresh, active && tab === "items" && !commands.busy);
  function open(action: StockEditorState["action"], item?: StockItem) {
    setEditor({ action, item, operationId: crypto.randomUUID() });
    setNotice("");
  }
  const blocked =
    commands.busy || !commands.ready || commands.pending.length > 0;
  return (
    <div
      className="stock-module stack"
      aria-label={t("Kelola stok", "Manage stock")}
    >
      <div className="row between">
        <div>
          <h2>{t("Stok barang", "Stock supplies")}</h2>
          <p className="muted">
            {t(
              "Pantau barang, atur pemakaian, dan catat stok yang datang.",
              "Track supplies, set usage and record deliveries.",
            )}
          </p>
        </div>
        <button disabled={blocked} onClick={() => open("create")}>
          {t("Tambah barang", "Add stock item")}
        </button>
      </div>
      <div
        className="stock-tabs"
        role="group"
        aria-label={t("Bagian stok", "Stock sections")}
      >
        {(
          [
            ["items", t("Barang", "Items")],
            ["recipe", t("Pemakaian per menu", "Menu usage")],
            ["history", t("Riwayat", "History")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="secondary"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {(error || (!editor && commands.error)) && (
        <div className="error" role="alert">
          {ownerMessage(error || commands.error, language)}
          <button className="text-button" onClick={() => void load()}>
            {t("Perbarui stok", "Refresh stock")}
          </button>
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <StockRecovery
        commands={commands}
        onResolved={() => {
          setEditor(null);
          void load();
        }}
      />
      {!data && <p role="status">{t("Memuat stok…", "Loading stock…")}</p>}
      <section
        hidden={tab !== "items"}
        className="stack"
        aria-label={t("Barang stok", "Stock items")}
      >
        {data && (
          <>
            <div className="stock-summary">
              <span>
                {data.items.length} {t("barang", "items")}
              </span>
              <span>
                {data.lowCount} {t("stok rendah", "low stock")}
              </span>
              {data.negativeCount > 0 && (
                <strong>
                  {data.negativeCount} {t("stok minus", "negative stock")}
                </strong>
              )}
            </div>
            {data.negativeCount > 0 && (
              <p className="stock-warning">
                {t(
                  "Ada stok minus. Penjualan tetap tercatat; periksa stok fisik dan pemakaian menu, lalu sesuaikan jika perlu.",
                  "Some balances are negative. Sales remain recorded; check physical stock and menu usage, then adjust if needed.",
                )}
              </p>
            )}
            <div className="stock-filter">
              <div>
                <label htmlFor="stock-search">
                  {t("Cari barang", "Search items")}
                </label>
                <input
                  id="stock-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="stock-check">
                <input
                  type="checkbox"
                  checked={lowOnly}
                  onChange={(e) => setLowOnly(e.target.checked)}
                />
                {t("Stok rendah saja", "Low stock only")}
              </label>
            </div>
            {!data.items.length && (
              <div className="card stack">
                <h3>
                  {t(
                    "Mulai dari barang yang dipakai setiap hari.",
                    "Start with the supplies you use daily.",
                  )}
                </h3>
                <p>
                  {t(
                    "Contoh: gelas, pack buah, pack dimsum, kemasan, dan telur. Setelah itu, atur Pemakaian per menu agar stok turun otomatis.",
                    "For example: cups, fruit packs, dimsum packs, packaging and eggs. Then configure Menu usage for automatic deductions.",
                  )}
                </p>
              </div>
            )}
            <ul className="stock-item-list">
              {data.items
                .filter(
                  (i) =>
                    i.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()) &&
                    (!lowOnly || i.balance <= i.lowThreshold),
                )
                .map((i) => (
                  <li className="card stock-item" key={i.id}>
                    <div className="row between">
                      <h3>{i.name}</h3>
                      {i.balance <= i.lowThreshold && (
                        <span
                          className={`stock-badge ${i.balance < 0 ? "negative" : ""}`}
                        >
                          {i.balance < 0
                            ? t("Stok minus", "Negative stock")
                            : t("Stok rendah", "Low stock")}
                        </span>
                      )}
                    </div>
                    <div className="stock-balance">
                      <strong>{number(i.balance)}</strong>
                      <span>{i.unit}</span>
                    </div>
                    <small>
                      {t("Batas pengingat", "Reminder threshold")}:{" "}
                      {number(i.lowThreshold)} {i.unit}
                    </small>
                    <div className="stock-item-actions">
                      <button
                        disabled={blocked}
                        onClick={() => open("restock", i)}
                      >
                        {t("Tambah stok", "Add stock")}
                      </button>
                      <button
                        className="secondary"
                        disabled={blocked}
                        onClick={() => open("adjust", i)}
                      >
                        {t("Sesuaikan stok", "Adjust stock")}
                      </button>
                      <button
                        className="text-button"
                        disabled={blocked}
                        onClick={() => open("edit", i)}
                      >
                        {t("Ubah", "Edit")}
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
            {data.items.length > 0 &&
              !data.items.some(
                (i) =>
                  i.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()) &&
                  (!lowOnly || i.balance <= i.lowThreshold),
              ) && (
                <p>{t("Tidak ada barang yang cocok.", "No matching items.")}</p>
              )}
          </>
        )}
      </section>
      <div hidden={tab !== "recipe"}>
        {data && (
          <StockRecipeEditor
            products={products}
            items={data.items}
            commands={commands}
          />
        )}
      </div>
      <div hidden={tab !== "history"}>
        {data && (
          <StockHistoryView
            items={data.items}
            active={active && tab === "history"}
          />
        )}
      </div>
      {active && editor && (
        <StockEditor
          key={editor.operationId}
          editor={editor}
          commands={commands}
          onClose={() => setEditor(null)}
          onRefresh={() => void load()}
          onSaved={async () => {
            setEditor(null);
            setNotice(t("Stok disimpan.", "Stock saved."));
            await load();
          }}
        />
      )}
    </div>
  );
}
