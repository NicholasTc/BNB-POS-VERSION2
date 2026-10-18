"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Employees } from "@/components/employees";
import { DeviceSettings } from "@/components/device-settings";
import { MenuManagement } from "@/components/menu-management";
import { Reports } from "@/components/reports";
import {
  OwnerLanguageProvider,
  useOwnerLanguage,
  applyOwnerLanguage,
} from "@/components/owner-language";
import { ownerMessage, type OwnerLanguage } from "@/lib/owner-language";
export default function Owner() {
  return (
    <OwnerLanguageProvider>
      <OwnerContent />
    </OwnerLanguageProvider>
  );
}
function OwnerContent() {
  const { language, t } = useOwnerLanguage();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [savingLanguage, setSavingLanguage] = useState(false),
    [languageNotice, setLanguageNotice] = useState(false);
  useEffect(() => {
    api<{ name: string; language: OwnerLanguage }>("/api/owner")
      .then((x) => {
        applyOwnerLanguage(x.language);
        setName(x.name);
      })
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
      const x = await api<{ name: string; language: OwnerLanguage }>(
        "/api/owner",
      );
      applyOwnerLanguage(x.language);
      setName(x.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum berhasil masuk.");
    } finally {
      setBusy(false);
    }
  }
  async function leave(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (busy || savingLanguage) return;
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
  async function selectLanguage(value: OwnerLanguage) {
    setError("");
    setLanguageNotice(false);
    if (!name) {
      applyOwnerLanguage(value);
      return;
    }
    setSavingLanguage(true);
    try {
      await api("/api/owner/preferences", { language: value });
      applyOwnerLanguage(value);
      setLanguageNotice(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingLanguage(false);
    }
  }
  return (
    <div lang={language}>
      <header className="app-header">
        <Link className="brand" href="/" onClick={leave}>
          lisi<span>{t("ruang pemilik")}</span>
        </Link>
        <div className="row">
          <div className="language-picker">
            <label htmlFor="owner-language">Bahasa / Language</label>
            <select
              id="owner-language"
              value={language}
              disabled={loading || busy || savingLanguage}
              onChange={(e) =>
                void selectLanguage(e.target.value as OwnerLanguage)
              }
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>
          <Link
            className="button secondary"
            href="/"
            onClick={leave}
            aria-disabled={busy || savingLanguage}
          >
            {t("Kasir")}
          </Link>
        </div>
      </header>
      <main className={name ? "content stack" : "center-stage stack"}>
        {savingLanguage ? (
          <small role="status">{t("Menyimpan…")}</small>
        ) : (
          languageNotice && <small role="status">{t("Bahasa disimpan.")}</small>
        )}
        {error && (
          <p className="error" role="alert">
            {ownerMessage(error, language)}
          </p>
        )}
        {loading ? (
          <p role="status">{t("Memuat…")}</p>
        ) : name ? (
          <>
            <div className="row between">
              <h1>
                {t("Halo,")} {name}.
              </h1>
              <button
                className="secondary"
                disabled={busy || savingLanguage}
                onClick={async () => {
                  if (busy || savingLanguage) return;
                  setBusy(true);
                  try {
                    await api("/api/auth/sign-out", {});
                    setName(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? t("Keluar…") : t("Keluar")}
              </button>
            </div>
            <Reports />
            <hr />
            <h2>{t("Pengaturan kafe")}</h2>
            <DeviceSettings />
            <Employees />
            <MenuManagement />
          </>
        ) : (
          <form className="card stack" onSubmit={login}>
            <h1>{t("Ruang pemilik")}</h1>
            <p className="muted">{t("Masuk untuk mengelola kafe.")}</p>
            <div>
              <label htmlFor="email">{t("Email")}</label>
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
              <label htmlFor="password">{t("Kata sandi")}</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </div>
            <button disabled={busy}>
              {busy ? t("Memeriksa…") : t("Masuk")}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
