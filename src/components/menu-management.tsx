"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { rupiah } from "@/lib/money";
import type { MenuProduct } from "@/lib/menu";
type Item = MenuProduct & { active: boolean };
export function MenuManagement({
  onLoad,
}: {
  onLoad?: (items: Item[]) => void;
}) {
  const { language, t } = useOwnerLanguage();
  const [items, setItems] = useState<Item[]>([]),
    [editing, setEditing] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Item[]>("/api/owner/menu")
        .then((items) => {
          setItems(items);
          onLoad?.(items);
        })
        .catch((e) => setError((e as Error).message)),
    [onLoad],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/owner/menu", {
        id: editing?.id,
        name: f.get("name"),
        price: Number(f.get("price")),
        active: f.get("active") === "on",
        category: f.get("category"),
        imageUrl: f.get("imageUrl"),
      });
      setEditing(null);
      form.reset();
      setNotice("Menu disimpan.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>{t("Menu kafe")}</h2>
      {error && (
        <p className="error" role="alert">
          {ownerMessage(error, language)}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {ownerMessage(notice, language)}
        </p>
      )}
      <div className="management-grid">
        <form className="stack" onSubmit={save} key={editing?.id ?? "new"}>
          <h3>{editing ? t("Ubah menu") : t("Tambah menu")}</h3>
          <div>
            <label htmlFor="menu-name">{t("Nama menu")}</label>
            <input
              id="menu-name"
              name="name"
              defaultValue={editing?.name ?? ""}
              required
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="menu-price">{t("Harga akhir (Rp)")}</label>
            <input
              id="menu-price"
              name="price"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000000}
              step={1}
              defaultValue={editing?.price ?? ""}
              required
            />
          </div>
          <div>
            <label htmlFor="menu-category">{t("Kategori")}</label>
            <select
              id="menu-category"
              name="category"
              defaultValue={editing?.category ?? "uncategorized"}
            >
              <option value="uncategorized">{t("Belum dikategorikan")}</option>
              <option value="drink">{t("Minuman")}</option>
              <option value="food">{t("Makanan")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="menu-image">{t("Foto menu (opsional)")}</label>
            <input
              id="menu-image"
              name="imageUrl"
              type="text"
              list="menu-photos"
              maxLength={2000}
              defaultValue={editing?.imageUrl ?? ""}
              placeholder="https://…"
              aria-describedby="menu-image-help"
            />
            <datalist id="menu-photos">
              <option value="/menu/mango.webp">{t("Contoh mangga")}</option>
              <option value="/menu/strawberry.webp">
                {t("Contoh stroberi")}
              </option>
              <option value="/menu/coffee.webp">{t("Contoh kopi")}</option>
              <option value="/menu/pastry.webp">{t("Contoh makanan")}</option>
              <option value="/menu/avocado.webp">{t("Contoh alpukat")}</option>
              <option value="/menu/tea.webp">{t("Contoh teh")}</option>
              <option value="/menu/water.webp">
                {t("Contoh air mineral")}
              </option>
            </datalist>
            <small id="menu-image-help">
              {t(
                "Gunakan URL HTTPS atau pilih foto contoh. Kosongkan untuk foto bawaan.",
              )}
            </small>
          </div>
          <label className="row">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
              style={{ width: 24, minHeight: 24 }}
            />
            {t("Tersedia")}
          </label>
          <div className="row">
            <button disabled={busy}>
              {busy ? t("Menyimpan…") : t("Simpan menu")}
            </button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                {t("Batal")}
              </button>
            )}
          </div>
        </form>
        <div className="stack">
          {items.length ? (
            items.map((e) => (
              <div className="row between" key={e.id}>
                <div>
                  <strong>{e.name}</strong>
                  <p className="muted">
                    {rupiah(e.price)}
                    {!e.active && <> • {t("Tidak tersedia")}</>}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setEditing(e)}
                  aria-label={`${t("Ubah menu")} ${e.name}`}
                >
                  {t("Ubah")}
                </button>
              </div>
            ))
          ) : (
            <p className="muted">{t("Tambahkan menu dan harga kafe Anda.")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
