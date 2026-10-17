"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Employees } from "@/components/employees";
import { DeviceSettings } from "@/components/device-settings";
import { MenuManagement } from "@/components/menu-management";
import { Reports } from "@/components/reports";
export default function Owner() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ name: string }>("/api/owner")
      .then((x) => setName(x.name))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/auth/sign-in/email", {
        email: f.get("email"),
        password: f.get("password"),
      });
      const x = await api<{ name: string }>("/api/owner");
      setName(x.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum berhasil masuk.");
    } finally {
      setBusy(false);
    }
  }
  async function leave(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/sign-out", {});
      setName(null);
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="app-header">
        <Link className="brand" href="/" onClick={leave}>
          lisi<span>ruang pemilik</span>
        </Link>
        <Link
          className="button secondary"
          href="/"
          onClick={leave}
          aria-disabled={busy}
        >
          Kasir
        </Link>
      </header>
      <main className={name ? "content stack" : "center-stage stack"}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Memuat…</p>
        ) : name ? (
          <>
            <div className="row between">
              <h1>Halo, {name}.</h1>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api("/api/auth/sign-out", {});
                    setName(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Keluar
              </button>
            </div>
            <Reports />
            <hr />
            <h2>Pengaturan kafe</h2>
            <DeviceSettings />
            <Employees />
            <MenuManagement />
          </>
        ) : (
          <form className="card stack" onSubmit={login}>
            <h1>Ruang pemilik</h1>
            <p className="muted">Masuk untuk mengelola kafe.</p>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </div>
            <div>
              <label htmlFor="password">Kata sandi</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </div>
            <button disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
          </form>
        )}
      </main>
    </>
  );
}
