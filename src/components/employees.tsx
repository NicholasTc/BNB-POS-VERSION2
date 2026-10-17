"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
type Employee = { id: string; name: string; active: boolean };
export function Employees() {
  const [items, setItems] = useState<Employee[]>([]),
    [editing, setEditing] = useState<Employee | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Employee[]>("/api/owner/employees")
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
      await api("/api/owner/employees", {
        id: editing?.id,
        name: f.get("name"),
        pin: f.get("pin") || undefined,
        active: f.get("active") === "on",
      });
      setEditing(null);
      form.reset();
      setNotice("Karyawan disimpan.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>Karyawan</h2>
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
          <h3>{editing ? "Ubah karyawan" : "Tambah karyawan"}</h3>
          <div>
            <label htmlFor="employee-name">Nama karyawan</label>
            <input
              id="employee-name"
              name="name"
              defaultValue={editing?.name ?? ""}
              required
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="new-pin">
              {editing ? "PIN baru (opsional)" : "PIN empat angka"}
            </label>
            <input
              id="new-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
              autoComplete="new-password"
              required={!editing}
            />
            <small>
              Berikan PIN langsung kepada karyawan. PIN lama tidak dapat
              dilihat.
            </small>
          </div>
          <label className="row">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
              style={{ width: 24, minHeight: 24 }}
            />
            Aktif
          </label>
          <div className="row">
            <button disabled={busy}>Simpan karyawan</button>
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
                  <p className="muted">{e.active ? "Aktif" : "Nonaktif"}</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setEditing(e)}
                  aria-label={`Ubah ${e.name}`}
                >
                  Ubah
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Tambahkan karyawan pertama untuk mulai.</p>
          )}
        </div>
      </div>
    </section>
  );
}
