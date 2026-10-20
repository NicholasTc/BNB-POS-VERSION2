"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "./owner-language";
import type { MenuProduct } from "@/lib/menu";
import { rupiah } from "@/lib/money";
import { ownerMessage } from "@/lib/owner-language";
import {
  promoRules,
  type Promo,
  type PromoRules,
} from "@/modules/promos/rules";
import "./promos.css";

const fresh = (): PromoRules => ({
  name: "",
  percent: 10,
  scope: "all",
  productIds: [],
  minQuantity: 1,
  minDistinct: 1,
  minSpend: 0,
  maxDiscount: null,
  priority: 10,
  active: true,
});
export function PromoManagement({ products }: { products: MenuProduct[] }) {
  const { language } = useOwnerLanguage();
  const t = (id: string, en: string) => (language === "en" ? en : id);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [draft, setDraft] = useState(fresh);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    const rows = await api<Promo[]>("/api/owner/promos");
    setPromos(rows);
    setLoaded(true);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    api<Promo[]>("/api/owner/promos", undefined, { signal: c.signal })
      .then((rows) => {
        setPromos(rows);
        setLoaded(true);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError((e as Error).message);
      });
    return () => c.abort();
  }, []);
  function update<K extends keyof PromoRules>(key: K, value: PromoRules[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!promoRules.safeParse(draft).success) {
      setError(
        t(
          "Periksa pilihan menu dan syarat promo.",
          "Check product selection and promo conditions.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await api("/api/owner/promos", {
        id: editing?.id,
        revision: editing?.revision,
        rules: draft,
      });
      setDraft(fresh());
      setEditing(null);
      setSearch("");
      setNotice(t("Promo disimpan.", "Promo saved."));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Promo) {
    setBusy(true);
    setError("");
    setNotice("");
    const { id, revision, ...rules } = p;
    try {
      await api("/api/owner/promos", {
        id,
        revision,
        rules: { ...rules, active: !p.active },
      });
      await load();
      setNotice(t("Status promo disimpan.", "Promo status saved."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack promo-management">
      <div>
        <h2>Promo</h2>
        <p className="muted">
          {t(
            "Buat promo. Kasir cukup memilih saat pembayaran.",
            "Create a promo. Cashiers simply select it at checkout.",
          )}
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {ownerMessage(error, language)}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            {t("Muat ulang daftar", "Reload list")}
          </button>
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="management-grid">
        <form className="stack" onSubmit={save}>
          <h3>
            {editing
              ? t("Ubah promo", "Edit promo")
              : t("Promo baru", "New promo")}
          </h3>
          <fieldset disabled={busy} className="promo-fields stack">
            <div>
              <label htmlFor="promo-name">
                {t("Nama promo", "Promo name")}
              </label>
              <input
                id="promo-name"
                value={draft.name}
                required
                maxLength={80}
                placeholder="Halloween"
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="promo-pair">
              <div>
                <label htmlFor="promo-percent">
                  {t("Diskon (%)", "Discount (%)")}
                </label>
                <input
                  id="promo-percent"
                  type="number"
                  required
                  min={1}
                  max={99}
                  value={draft.percent}
                  onChange={(e) => update("percent", Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="promo-scope">
                  {t("Berlaku untuk", "Applies to")}
                </label>
                <select
                  id="promo-scope"
                  value={draft.scope}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      scope: e.target.value as "all" | "selected",
                      productIds: [],
                      minDistinct: 1,
                    }))
                  }
                >
                  <option value="all">{t("Semua menu", "All products")}</option>
                  <option value="selected">
                    {t("Menu pilihan", "Selected products")}
                  </option>
                </select>
              </div>
            </div>
            {draft.scope === "selected" && (
              <div className="stack">
                <label htmlFor="promo-search">
                  {t("Pilih menu promo", "Choose promo products")} (
                  {draft.productIds.length})
                </label>
                <input
                  id="promo-search"
                  type="search"
                  value={search}
                  placeholder={t("Cari menu…", "Search products…")}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="promo-products">
                  {products
                    .filter((p) =>
                      p.name
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase()),
                    )
                    .map((p) => (
                      <label className="promo-choice" key={p.id}>
                        <input
                          type="checkbox"
                          checked={draft.productIds.includes(p.id)}
                          onChange={(e) =>
                            update(
                              "productIds",
                              e.target.checked
                                ? [...draft.productIds, p.id]
                                : draft.productIds.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>
                          {p.name}
                          <small>{rupiah(p.price)}</small>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
            <details className="promo-conditions" key={editing?.id ?? "new"}>
              <summary>
                {t(
                  "Syarat & batas (opsional)",
                  "Conditions & limits (optional)",
                )}
              </summary>
              <div className="stack">
                <p className="muted">
                  {t(
                    "Jumlah dan menu berbeda dihitung dari menu yang berlaku. Minimal belanja dihitung dari seluruh pesanan sebelum diskon.",
                    "Quantity and distinct products count applicable products. Minimum spend uses the entire order before discounts.",
                  )}
                </p>
                <div className="promo-pair">
                  <div>
                    <label htmlFor="promo-qty">
                      {t("Minimal jumlah item", "Minimum item quantity")}
                    </label>
                    <input
                      id="promo-qty"
                      type="number"
                      required
                      min={1}
                      max={4950}
                      value={draft.minQuantity}
                      onChange={(e) =>
                        update("minQuantity", Number(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="promo-distinct">
                      {t("Minimal menu berbeda", "Minimum distinct products")}
                    </label>
                    <input
                      id="promo-distinct"
                      type="number"
                      required
                      min={1}
                      max={50}
                      value={draft.minDistinct}
                      onChange={(e) =>
                        update("minDistinct", Number(e.target.value))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="promo-spend">
                    {t("Minimal belanja (Rp)", "Minimum spend (Rp)")}
                  </label>
                  <input
                    id="promo-spend"
                    type="number"
                    required
                    min={0}
                    max={1000000000}
                    value={draft.minSpend}
                    onChange={(e) => update("minSpend", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label htmlFor="promo-cap">
                    {t(
                      "Maksimal diskon (Rp, kosong = tanpa batas)",
                      "Discount cap (Rp, empty = no cap)",
                    )}
                  </label>
                  <input
                    id="promo-cap"
                    type="number"
                    min={1}
                    max={1000000000}
                    value={draft.maxDiscount ?? ""}
                    onChange={(e) =>
                      update(
                        "maxDiscount",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </div>
                <div>
                  <label htmlFor="promo-priority">
                    {t(
                      "Urutan penerapan (angka kecil lebih dulu)",
                      "Application order (lower first)",
                    )}
                  </label>
                  <input
                    id="promo-priority"
                    type="number"
                    required
                    min={0}
                    max={999}
                    value={draft.priority}
                    onChange={(e) => update("priority", Number(e.target.value))}
                  />
                </div>
              </div>
            </details>
            <div className="promo-preview">
              <strong>
                {draft.name || t("Pratinjau promo", "Promo preview")} ·{" "}
                {draft.percent}%
              </strong>
              <p>
                {draft.scope === "all"
                  ? t("Semua menu", "All products")
                  : `${draft.productIds.length} ${t("menu pilihan", "selected products")}`}{" "}
                · {t("Minimal", "Minimum")} {draft.minQuantity}{" "}
                {t("item", "items")}, {draft.minDistinct}{" "}
                {t("menu berbeda", "distinct products")}
                {draft.minSpend > 0 ? ` · ${rupiah(draft.minSpend)}` : ""}
              </p>
              {draft.maxDiscount !== null && (
                <small>
                  {t("Diskon maksimal", "Discount capped at")}{" "}
                  {rupiah(draft.maxDiscount)}
                </small>
              )}
            </div>
            <label className="promo-choice">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => update("active", e.target.checked)}
              />
              {t("Promo aktif", "Promo active")}
            </label>
            <div className="row">
              <button type="submit">
                {busy
                  ? t("Menyimpan…", "Saving…")
                  : t("Simpan promo", "Save promo")}
              </button>
              {editing && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setDraft(fresh());
                    setSearch("");
                  }}
                >
                  {t("Batal mengubah", "Cancel edit")}
                </button>
              )}
            </div>
          </fieldset>
        </form>
        <div className="stack">
          <h3>{t("Daftar promo", "Promo list")}</h3>
          <p className="muted">
            {t(
              "Perubahan hanya berlaku untuk pembayaran baru. Beberapa promo dapat dipilih bersama.",
              "Changes apply to new payments only. Multiple promos can be selected together.",
            )}
          </p>
          {!loaded && <p role="status">{t("Memuat…", "Loading…")}</p>}
          {loaded && !promos.length && (
            <p>
              {t(
                "Belum ada promo. Buat promo pertama di formulir ini.",
                "No promos yet. Create your first promo using this form.",
              )}
            </p>
          )}
          {[...promos]
            .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
            .map((p) => (
              <article className="promo-list-item stack" key={p.id}>
                <div className="row between">
                  <strong>{p.name}</strong>
                  <span className="badge">{p.percent}%</span>
                </div>
                <small>
                  {p.active ? t("Aktif", "Active") : t("Nonaktif", "Inactive")}{" "}
                  ·{" "}
                  {p.scope === "all"
                    ? t("Semua menu", "All products")
                    : `${p.productIds.length} ${t("menu pilihan", "selected products")}`}{" "}
                  · {t("Urutan", "Order")} {p.priority}
                </small>
                <div className="row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      const { id: _id, revision: _revision, ...rules } = p;
                      void _id;
                      void _revision;
                      setEditing(p);
                      setDraft(rules);
                      setSearch("");
                      setNotice("");
                    }}
                  >
                    {t("Ubah", "Edit")} {p.name}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void toggle(p)}
                  >
                    {p.active
                      ? t("Nonaktifkan", "Deactivate")
                      : t("Aktifkan", "Activate")}
                  </button>
                </div>
              </article>
            ))}
        </div>
      </div>
    </section>
  );
}
