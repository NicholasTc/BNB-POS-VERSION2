"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useOwnerLanguage } from "@/components/owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { rupiah } from "@/lib/money";
type Item = { id: string; name: string; price: number; active: boolean };
export function MenuManagement() {
  const { language, t } = useOwnerLanguage();
  const [items, setItems] = useState<Item[]>([]),
    [editing, setEditing] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Item[]>("/api/owner/menu")
        .then(setItems)
        .catch((e) => setError((e as Error).message)),
    [],
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
