"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Employees } from "./employees";
import {
  OwnerLanguageProvider,
  useOwnerLanguage,
  applyOwnerLanguage,
} from "./owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { adminApi } from "@/lib/admin-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import type { OwnerList } from "@/modules/account-manager/types";
export function AccountManager() {
  return (
    <OwnerLanguageProvider>
      <AdminContent />
    </OwnerLanguageProvider>
  );
}
function AdminContent() {
  const { language } = useOwnerLanguage();
  const t = (id: string, en: string) => (language === "en" ? en : id);
  const [identity, setIdentity] = useState<{
      name: string;
      email: string;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"owners" | "staff">("owners");
  const clear = useCallback(() => {
    setIdentity(null);
    setTab("owners");
  }, []);
  const access = useAdminAccess(!!identity, clear);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<{ name: string; email: string }>("/api/admin/session", undefined, {
      signal: controller.signal,
      background: true,
    })
      .then(setIdentity)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/admin/session", {
        email: values.get("email"),
        password: values.get("password"),
      });
      form.reset();
      setIdentity(await adminApi("/api/admin/session"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/auth/sign-out", {});
      clear();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-app" lang={language}>
      <header className="admin-header">
        <div className="admin-wordmark" aria-label="lisi café">
          lisi<small>café</small>
        </div>
        <div className="admin-header-tools">
          <label htmlFor="admin-language">Bahasa / Language</label>
          <select
            id="admin-language"
            value={language}
            onChange={(e) =>
              applyOwnerLanguage(e.target.value === "en" ? "en" : "id")
            }
          >
            <option value="id">Indonesia</option>
            <option value="en">English</option>
          </select>
          {identity && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void logout()}
            >
              {t("Keluar", "Sign out")}
            </button>
          )}
        </div>
      </header>
      <main
        className={identity ? "admin-workspace stack" : "admin-login stack"}
      >
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">{t("Memeriksa akses…", "Checking access…")}</p>
        ) : !identity ? (
          <form className="card stack" onSubmit={login}>
            <div>
              <h1>Account manager</h1>
              <p className="muted">
                {t(
                  "Masuk sebagai administrator untuk mengelola akun kafe.",
                  "Sign in as administrator to manage café accounts.",
                )}
              </p>
            </div>
            <div>
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </div>
            <div>
              <label htmlFor="admin-password">
                {t("Kata sandi", "Password")}
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </div>
            <button disabled={busy}>
              {busy ? t("Memeriksa…", "Signing in…") : t("Masuk", "Sign in")}
            </button>
          </form>
        ) : (
          <>
            <div className="admin-title">
              <div>
                <h1>Account manager</h1>
                <p className="muted">
                  {t(
                    "Satu kafe. Akses terpisah untuk pemilik dan staf.",
                    "One café. Separate access for owners and staff.",
                  )}
                </p>
              </div>
              <p className="admin-identity">{identity.email}</p>
            </div>
            {access.checking && (
              <p role="status">
                {(access.error && ownerMessage(access.error, language)) ||
                  t("Memeriksa akses…", "Checking access…")}
              </p>
            )}
            <div
              hidden={access.checking}
              inert={access.checking}
              className="stack"
            >
              <nav
                className="admin-tabs"
                aria-label={t(
                  "Bagian pengelolaan akun",
                  "Account management sections",
                )}
              >
                <button
                  type="button"
                  className={tab === "owners" ? "" : "secondary"}
                  aria-pressed={tab === "owners"}
                  onClick={() => setTab("owners")}
                >
                  {t("Pemilik", "Owners")}
                </button>
                <button
                  type="button"
                  className={tab === "staff" ? "" : "secondary"}
                  aria-pressed={tab === "staff"}
                  onClick={() => setTab("staff")}
                >
                  {t("Staf", "Staff")}
                </button>
              </nav>
              <div hidden={tab !== "owners"}>
                <Owners />
              </div>
              <div hidden={tab !== "staff"}>
                <Employees endpoint="/api/admin/employees" request={adminApi} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
function Owners() {
  const { language } = useOwnerLanguage();
  const t = (id: string, en: string) => (language === "en" ? en : id);
  const [listing, setListing] = useState<OwnerList | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(
    (signal?: AbortSignal) =>
      adminApi<OwnerList>(`/api/admin/owners?page=${page}`, undefined, {
        signal,
        background: true,
      }).then((next) => {
        if (!signal?.aborted) setListing(next);
      }),
    [page],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setError((error as Error).message);
    });
    return () => controller.abort();
  }, [load]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      f = new FormData(form);
    setError("");
    setNotice("");
    if (f.get("password") !== f.get("confirmPassword")) {
      setError(t("Kata sandi baru tidak sama.", "New passwords do not match."));
      return;
    }
    const credentials = {
      name: String(f.get("name")).trim(),
      email: String(f.get("email")).trim().toLowerCase(),
      password: String(f.get("password")),
    };
    // Retry uses a stable ID; no credential or account payload enters storage.
    const signature = JSON.stringify(credentials);
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await adminApi("/api/admin/owners", {
        ...credentials,
        operationId: operation.current.id,
        adminPassword: f.get("adminPassword"),
      });
      operation.current = null;
      form.reset();
      setNotice(
        t(
          "Akun pemilik dibuat. Akun ini melihat data kafe yang sama.",
          "Owner account created. This account shares the same café data.",
        ),
      );
      if (page === 1) await load();
      else setPage(1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card stack"
      aria-label={t("Akun pemilik", "Owner accounts")}
    >
      <div>
        <h2>{t("Akun pemilik", "Owner accounts")}</h2>
        <p className="admin-shared-note">
          {t(
            "Semua pemilik berbagi penjualan, pendapatan, menu, stok, dan staf kafe ini.",
            "Every owner shares this café’s sales, revenue, menu, inventory and staff.",
          )}
        </p>
      </div>
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
      <div className="admin-owner-grid">
        <div className="stack">
          <h3>{t("Pemilik terdaftar", "Existing owners")}</h3>
          {!listing ? (
            <p role="status">{t("Memuat akun…", "Loading accounts…")}</p>
          ) : (
            <>
              <ul className="admin-accounts">
                {listing.owners.map((owner) => (
                  <li key={owner.id}>
                    <strong>{owner.name}</strong>
                    <span>{owner.email}</span>
                    <small>{t("Pemilik", "Owner")}</small>
                  </li>
                ))}
              </ul>
              {!listing.total && (
                <p className="muted">
                  {t("Belum ada akun pemilik.", "No owner accounts yet.")}
                </p>
              )}
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("Sebelumnya", "Previous")}
                </button>
                <span>
                  {page} /{" "}
                  {Math.max(1, Math.ceil(listing.total / listing.pageSize))}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={page * listing.pageSize >= listing.total || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("Berikutnya", "Next")}
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((error) => setError((error as Error).message))
            }
          >
            {t("Muat ulang akun", "Refresh accounts")}
          </button>
        </div>
        <form className="stack" onSubmit={create} autoComplete="off">
          <h3>{t("Tambah pemilik", "Add owner")}</h3>
          <fieldset disabled={busy} className="stack">
            <div>
              <label htmlFor="owner-create-name">
                {t("Nama pemilik", "Owner name")}
              </label>
              <input
                id="owner-create-name"
                name="name"
                autoComplete="off"
                required
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="owner-create-email">
                {t("Email pemilik", "Owner email")}
              </label>
              <input
                id="owner-create-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
              />
            </div>
            <div>
              <label htmlFor="owner-create-password">
                {t("Kata sandi pemilik", "Owner password")}
              </label>
              <input
                id="owner-create-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <small>
                {t(
                  "12–128 karakter. Berikan langsung kepada pemilik.",
                  "12–128 characters. Give it directly to the owner.",
                )}
              </small>
            </div>
            <div>
              <label htmlFor="owner-confirm-password">
                {t("Ulangi kata sandi pemilik", "Repeat owner password")}
              </label>
              <input
                id="owner-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </div>
            <div className="admin-confirm">
              <label htmlFor="owner-admin-password">
                {t(
                  "Konfirmasi kata sandi administrator",
                  "Confirm administrator password",
                )}
              </label>
              <input
                id="owner-admin-password"
                name="adminPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
              <small>
                {t(
                  "Diperlukan setiap kali membuat akun pemilik.",
                  "Required whenever you create an owner account.",
                )}
              </small>
            </div>
            <button>
              {busy
                ? t("Membuat akun…", "Creating account…")
                : t("Buat akun pemilik", "Create owner account")}
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}
