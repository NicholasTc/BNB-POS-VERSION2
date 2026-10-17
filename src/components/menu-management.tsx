"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { rupiah } from "@/lib/money";
type Item = { id: string; name: string; price: number; active: boolean };
export function MenuManagement() {
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
      <h2>Menu kafe</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="management-grid">
        <form className="stack" onSubmit={save} key={editing?.id ?? "new"}>
          <h3>{editing ? "Ubah menu" : "Tambah menu"}</h3>
          <div>
            <label htmlFor="menu-name">Nama menu</label>
            <input
              id="menu-name"
              name="name"
              defaultValue={editing?.name ?? ""}
              required
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="menu-price">Harga akhir (Rp)</label>
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
            Tersedia
          </label>
          <div className="row">
            <button disabled={busy}>Simpan menu</button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Batal
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
                    {!e.active ? " • Tidak tersedia" : ""}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setEditing(e)}
                  aria-label={`Ubah menu ${e.name}`}
                >
                  Ubah
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Tambahkan menu dan harga kafe Anda.</p>
          )}
        </div>
      </div>
    </section>
  );
}
