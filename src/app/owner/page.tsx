"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Employees } from "@/components/employees";
import { DeviceSettings } from "@/components/device-settings";
import { OwnerLogin } from "@/components/owner-login";
import { AccessShell, CASHIER_PATH } from "@/components/access-shell";
import { DeviceTrustReminder } from "@/components/device-trust-reminder";
import { MenuManagement } from "@/components/menu-management";
import { PromoManagement } from "@/components/promo-management";
import { Reports } from "@/components/reports";
import {
  OwnerLanguageProvider,
  useOwnerLanguage,
  applyOwnerLanguage,
} from "@/components/owner-language";
import { ownerMessage, type OwnerLanguage } from "@/lib/owner-language";
import { useOwnerAccess } from "@/lib/use-owner-access";
import { OwnerNavigation, type OwnerView } from "@/components/owner-navigation";
import type { MenuProduct } from "@/lib/menu";
import "./owner.css";
import { OwnerAlerts } from "@/components/owner-alerts";
import type { AlertDestination } from "@/modules/alerts/types";
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
  const [view, setView] = useState<OwnerView>("summary");
  const [alertSettings, setAlertSettings] = useState<
    { tab: "menu" | "stock" | "device"; token: number } | undefined
  >();
  function navigateAlert(destination: AlertDestination) {
    if (destination === "transactions") navigate("transactions");
    else {
      setAlertSettings((previous) => ({
        tab: destination,
        token: (previous?.token ?? 0) + 1,
      }));
      navigate("settings");
    }
  }
  const [cashierSetup, setCashierSetup] = useState(false);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const clearOwner = useCallback(() => setName(null), []);
  const access = useOwnerAccess(!!name, clearOwner);
  useEffect(() => {
    let live = true;
    const setup =
      new URLSearchParams(window.location.search).get("setup") === "cashier";
    // This is only a navigation hint; pairing still requires owner auth and
    // an explicit confirmation through the existing owner-only API.
    void Promise.resolve().then(() => {
      if (!live) return;
      setCashierSetup(setup);
      if (setup) setView("settings");
    });
    api<{ name: string; language: OwnerLanguage }>("/api/owner")
      .then((x) => {
        if (!live) return;
        applyOwnerLanguage(x.language);
        setName(x.name);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
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
      setView(cashierSetup ? "settings" : "summary");
      setName(x.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum berhasil masuk.");
    } finally {
      setBusy(false);
    }
  }
  async function leave(e: React.MouseEvent<HTMLAnchorElement>, destination = CASHIER_PATH) {
    e.preventDefault();
    if (busy || savingLanguage) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/sign-out", {});
      setName(null);
      router.push(destination);
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
  function navigate(next: OwnerView) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const languagePicker = (
    <div className="language-picker">
      <label htmlFor="owner-language">Bahasa / Language</label>
      <select
        id="owner-language"
        value={language}
        disabled={loading || busy || savingLanguage}
        onChange={(e) => void selectLanguage(e.target.value as OwnerLanguage)}
      >
        <option value="id">Indonesia</option>
        <option value="en">English</option>
      </select>
    </div>
  );
  if (!name) return <OwnerLogin setup={cashierSetup} loading={loading} busy={busy} error={error ? ownerMessage(error, language) : ""} tools={languagePicker} onSubmit={e => void login(e)} />;
  if (cashierSetup) return <>
    {access.checking && <AccessShell setup language={language} busy={busy} onHome={e => void leave(e, "/")}><h1 id="access-title">{t("Memeriksa akses pemilik…")}</h1><p role="status">{access.error ? ownerMessage(access.error, language) : t("Memuat…")}</p></AccessShell>}
    <div hidden={access.checking} inert={access.checking}>
      <DeviceSettings setupOnly onCancel={leave} onHome={e => void leave(e, "/")} leaving={busy} leaveError={error ? ownerMessage(error, language) : ""} />
    </div>
  </>;
  return (
    <div
      lang={language}
      className={`owner-app ${name ? "owner-authenticated" : "owner-login"}`}
    >
      {name && (
        <aside className="owner-sidebar">
          <div className="owner-wordmark" aria-label="BNB — Bites and Blends">
            BnB<small>Bites and Blends</small>
          </div>
          <OwnerNavigation view={view} onChange={navigate} />
          <div className="owner-profile">
            <span className="owner-avatar" aria-hidden="true">
              {name.slice(0, 1)}
            </span>
            <div>
              <small>{t("Pemilik")}</small>
              <strong>{name}</strong>
            </div>
          </div>
        </aside>
      )}
      <div className="owner-workspace">
        <header className="owner-toolbar">
          <span
            className="owner-mobile-brand owner-wordmark"
            aria-label="BNB — Bites and Blends"
          >
            BnB<small>Bites and Blends</small>
          </span>
          {name && !access.checking && (
            <DeviceTrustReminder onSettings={() => navigateAlert("device")} />
          )}
          <div className="owner-tools">
            {name && !access.checking && (
              <OwnerAlerts onNavigate={navigateAlert} />
            )}
            {languagePicker}
            <Link
              className="button secondary"
              href={CASHIER_PATH}
              onClick={leave}
              aria-disabled={busy || savingLanguage}
            >
              {t("Kasir")}
            </Link>
            {name && (
              <button
                className="secondary"
                disabled={busy || savingLanguage}
                onClick={async () => {
                  setBusy(true);
                  setError("");
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
            )}
          </div>
        </header>
        <main className={name ? "owner-content" : "center-stage stack"}>
          {savingLanguage ? (
            <small role="status">{t("Menyimpan…")}</small>
          ) : (
            languageNotice && (
              <small role="status">{t("Bahasa disimpan.")}</small>
            )
          )}
          {error && (
            <p className="error" role="alert">
              {ownerMessage(error, language)}
            </p>
          )}
          {name && access.checking && (
            <p role="status">
              {access.error
                ? ownerMessage(access.error, language)
                : t("Memeriksa akses pemilik…")}
            </p>
          )}
            <div hidden={access.checking} inert={access.checking}>
              <Reports
                settingsRequest={alertSettings}
                view={view}
                onNavigate={navigate}
                products={products}
                staff={<Employees />}
                settings={
                  <>
                    <MenuManagement onLoad={setProducts} />
                  </>
                }
                device={<DeviceSettings />}
                promos={<PromoManagement products={products} />}
                initialSettingsTab="menu"
              />
            </div>
        </main>
      </div>
    </div>
  );
}
