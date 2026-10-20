"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { loadCashier } from "@/lib/cashier-load";
import { PinPad } from "./pin-pad";
import { Sales, type SalesHandle } from "./sales";
import { Modal } from "./modal";
import { LisiLogo, PosIcon } from "./pos-icons";
import { OrderBoard } from "./order-board";
import { SessionFarewell } from "./session-farewell";
import type { SessionFarewell as Farewell } from "@/modules/orders/types";
import "./cashier.css";
import "./cashier-desktop.css";
export type PosState = {
  paired: true;
  shifts: { id: string; employeeId: string; name: string; clockIn: string }[];
  cashier: { employeeId: string; name: string } | null;
  generation: number;
  expiresAt: string | null;
};
export function Pos() {
  const [farewell, setFarewell] = useState<Farewell | null>(null);
  const closeFarewell = useCallback(() => setFarewell(null), []);
  const salesRef = useRef<SalesHandle>(null);
  const handoffReady = useRef(false);
  const activeLoad = useRef<{
    controller: AbortController;
    promise: Promise<PosState | null>;
  } | null>(null);
  const loadVersion = useRef(0);
  const [state, setState] = useState<PosState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [deviceRequired, setDeviceRequired] = useState(false),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [staffOpen, setStaffOpen] = useState(false),
    [action, setAction] = useState<"clock-in" | "switch" | "clock-out">(
      "clock-in",
    ),
    [dialog, setDialog] = useState(false),
    [loginEntry, setLoginEntry] = useState(false),
    [notice, setNotice] = useState("");
  const refresh = useCallback(() => {
    if (activeLoad.current) return activeLoad.current.promise;
    const controller = new AbortController();
    loadVersion.current++;
    const promise = Promise.resolve().then(async () => {
      try {
        if (!handoffReady.current) {
          await loadCashier("/api/auth/sign-out", controller.signal);
          if (controller.signal.aborted) return null;
          handoffReady.current = true;
        }
        const current = await loadCashier<PosState>(
          "/api/pos",
          controller.signal,
        );
        if (controller.signal.aborted) return null;
        setState(current);
        setDeviceRequired(false);
        setLoadError("");
        setError("");
        return current;
      } catch (e) {
        if (controller.signal.aborted) return null;
        if (
          !handoffReady.current ||
          (e instanceof ApiError && e.status === 401)
        )
          setState(null);
        setDeviceRequired(
          handoffReady.current && e instanceof ApiError && e.status === 401,
        );
        setLoadError((e as Error).message);
        return null;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (activeLoad.current?.controller === controller)
          activeLoad.current = null;
      }
    });
    activeLoad.current = { controller, promise };
    return promise;
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void refresh();
    });
    const onRestore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      activeLoad.current?.controller.abort();
      activeLoad.current = null;
      handoffReady.current = false;
      setLoading(true);
      setState(null);
      void refresh();
    };
    window.addEventListener("pageshow", onRestore);
    return () => {
      live = false;
      activeLoad.current?.controller.abort();
      activeLoad.current = null;
      window.removeEventListener("pageshow", onRestore);
    };
  }, [refresh]);
  const refreshStatus = useCallback(
    async (signal: AbortSignal) => {
      if (!handoffReady.current) {
        await refresh();
        return;
      }
      if (activeLoad.current) return;
      const version = loadVersion.current;
      try {
        const current = await loadCashier<PosState>("/api/pos", signal);
        if (!signal.aborted && version === loadVersion.current) {
          setState(current);
          setDeviceRequired(false);
          setLoadError("");
        }
      } catch (e) {
        if (
          !signal.aborted &&
          version === loadVersion.current &&
          e instanceof ApiError &&
          e.status === 401
        ) {
          setState(null);
          setDeviceRequired(true);
          setLoadError(e.message);
        }
        // Temporary connectivity does not clear a cart or a financial error.
      }
    },
    [refresh],
  );
  useAutoRefresh(refreshStatus, !loading && !busy);
  useEffect(() => {
    let last = 0;
    const touch = (e: Event) => {
      if (!e.isTrusted || !state?.cashier || Date.now() - last < 60000) return;
      last = Date.now();
      void api("/api/pos", { action: "touch" }).catch(() => void refresh());
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [state?.cashier, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function submit(pin: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ farewell?: Farewell | null }>("/api/pos", {
        action,
        pin,
      });
      setDialog(false);
      if (action !== "clock-in" && !salesRef.current?.pending)
        salesRef.current?.clearCart();
      setNotice(
        action === "clock-in"
          ? "Selamat bekerja!"
          : action === "switch"
            ? "Kasir berhasil diganti."
            : "Shift selesai. Terima kasih! ",
      );
      await refresh();
      if (result.farewell) setFarewell(result.farewell);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(value: typeof action, quickLogin = false) {
    if (salesRef.current?.pending && value !== "switch") {
      setError("Periksa dan selesaikan transaksi sebelumnya terlebih dahulu.");
      return;
    }
    if (
      !salesRef.current?.pending &&
      salesRef.current?.hasCart &&
      value !== "clock-in" &&
      !window.confirm(
        "Hapus pesanan yang belum dibayar sebelum mengganti atau mengakhiri kasir?",
      )
    )
      return;
    setStaffOpen(false);
    setError("");
    setAction(value);
    setLoginEntry(quickLogin);
    setDialog(true);
  }
  async function cashierLogin() {
    if (state && handoffReady.current) {
      open(state.shifts.length ? "switch" : "clock-in", true);
      return;
    }
    setChecking(true);
    try {
      const current = await refresh();
      // A failed owner logout must never expose employee entry.
      if (!handoffReady.current) return;
      if (current) open(current.shifts.length ? "switch" : "clock-in", true);
      else {
        setStaffOpen(false);
        setLoginEntry(true);
        setDialog(true);
      }
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="cashier-app">
      <header className="cashier-header">
        <Link className="cashier-brand" href="/" aria-label="LISI kasir">
          <LisiLogo />
        </Link>
        <div className="cashier-identity">
          <button
            className="staff-toggle"
            aria-expanded={staffOpen}
            aria-controls="staff-panel"
            onClick={() => setStaffOpen(!staffOpen)}
          >
            Staf <PosIcon name="chevron" />
          </button>
        </div>
        {staffOpen && (
          <section
            id="staff-panel"
            className="staff-panel stack"
            aria-label="Staf"
          >
            {state && (
              <>
                <button disabled={busy} onClick={() => open("clock-in")}>
                  Mulai kerja
                </button>
                <button
                  className="secondary"
                  disabled={busy || !state.shifts.length}
                  onClick={() => open("switch")}
                >
                  Ganti kasir
                </button>
                <button
                  className="secondary"
                  disabled={busy || !state.shifts.length}
                  onClick={() => open("clock-out")}
                >
                  Selesai kerja
                </button>
                {state.cashier && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/api/pos", { action: "lock" });
                        setStaffOpen(false);
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Mengunci…" : "Kunci kasir"}
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    try {
                      await refresh();
                      await salesRef.current?.check();
                    } finally {
                      setChecking(false);
                    }
                  }}
                >
                  {checking ? "Memeriksa…" : "Perbarui & periksa"}
                </button>
                <div className="staff-attendance">
                  <h2>
                    Sedang bekerja{" "}
                    <span className="badge">{state.shifts.length}</span>
                  </h2>
                  {state.shifts.length ? (
                    <ul className="shift-list">
                      {state.shifts.map((s) => (
                        <li key={s.id}>
                          <strong>{s.name}</strong>
                          <span className="muted">
                            Sejak{" "}
                            {new Intl.DateTimeFormat("id-ID", {
                              timeZone: "Asia/Jakarta",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(s.clockIn))}
                          </span>
                          {state.cashier?.employeeId === s.employeeId && (
                            <span className="badge">Kasir aktif</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Belum ada yang mulai kerja.</p>
                  )}
                </div>
              </>
            )}
            <Link className="button secondary" href="/owner">
              Pemilik
            </Link>
            <button className="text-button" onClick={() => setStaffOpen(false)}>
              Tutup menu staf
            </button>
          </section>
        )}
      </header>
      <main className={state ? "content stack" : "cashier-welcome stack"}>
        {state && (
          <section
            className={`cashier-status ${state.cashier ? "is-active" : "is-locked"}`}
            aria-label="Status kasir"
            role="status"
            data-testid="cashier-status"
          >
            <div className="cashier-status-identity">
              <PosIcon name={state.cashier ? "person" : "lock"} />
              {state.cashier ? (
                <strong aria-label={`Kasir: ${state.cashier.name}`}>
                  Kasir: {state.cashier.name}
                </strong>
              ) : (
                <strong>Belum ada kasir</strong>
              )}
            </div>
            {state.cashier ? (
              <span className="cashier-active">
                <span aria-hidden="true" />
                Aktif
              </span>
            ) : (
              <button
                className="cashier-sign-in"
                disabled={busy}
                onClick={() => void cashierLogin()}
              >
                Cashier login
              </button>
            )}
          </section>
        )}
        {(error || loadError) && !deviceRequired && (
          <p className="error" role="alert">
            {error || loadError}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <p role="status">Memuat kasir…</p>
        ) : !state ? (
          <section className="card cashier-welcome-card stack">
            <span className="cashier-welcome-icon">
              <PosIcon name="person" />
            </span>
            <h1>Siap menyambut hari?</h1>
            <p className="muted">
              Masuk dengan PIN empat angka untuk mulai melayani.
            </p>
            <button disabled={checking} onClick={() => void cashierLogin()}>
              {checking ? "Memeriksa…" : "Cashier login"}
            </button>
            <div className="cashier-setup-note">
              <PosIcon name="lock" />
              <p>
                Browser ini perlu dihubungkan oleh pemilik sekali sebelum PIN
                dapat digunakan. Masuk ke akun pemilik saja belum menghubungkan
                perangkat.
              </p>
            </div>
            <Link className="button secondary" href="/owner?setup=cashier">
              Hubungkan perangkat
            </Link>
            <button
              className="secondary"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  await refresh();
                } finally {
                  setChecking(false);
                }
              }}
            >
              {checking ? "Memeriksa…" : "Periksa koneksi"}
            </button>
          </section>
        ) : (
          <>
            <Sales ref={salesRef} state={state} />
            <OrderBoard
              key={`${state.generation}:${state.cashier?.employeeId ?? "locked"}`}
              state={state}
            />
          </>
        )}
      </main>
      {dialog && (
        <Modal
          className="cashier-pin-dialog"
          title={
            loginEntry
              ? "Cashier login"
              : action === "clock-in"
                ? "Mulai kerja"
                : action === "switch"
                  ? "Ganti kasir"
                  : "Selesai kerja"
          }
          busy={busy}
          onClose={() => {
            setDialog(false);
            setError("");
          }}
        >
          {loginEntry && !state ? (
            <>
              <div className="cashier-setup-note">
                <PosIcon name="lock" />
                <p>
                  Perangkat belum terhubung. Minta pemilik menghubungkan browser
                  ini terlebih dahulu. PIN karyawan hanya membuka kasir.
                </p>
              </div>
              <Link className="button" href="/owner?setup=cashier">
                Hubungkan perangkat
              </Link>
              <button
                className="secondary"
                disabled={checking}
                onClick={() => void cashierLogin()}
              >
                {checking ? "Memeriksa…" : "Periksa koneksi"}
              </button>
            </>
          ) : (
            <>
              {loginEntry && state && state.shifts.length > 0 && (
                <div
                  className="cashier-login-options"
                  role="group"
                  aria-label="Shift Anda"
                >
                  <button
                    className="secondary"
                    aria-pressed={action === "switch"}
                    disabled={busy}
                    onClick={() => open("switch", true)}
                  >
                    Sudah mulai kerja
                  </button>
                  <button
                    className="secondary"
                    aria-pressed={action === "clock-in"}
                    disabled={busy}
                    onClick={() => open("clock-in", true)}
                  >
                    Mulai shift baru
                  </button>
                </div>
              )}
              <p className="muted">
                {action === "switch"
                  ? "PIN karyawan yang akan menjadi kasir. Shift tidak berubah."
                  : action === "clock-out"
                    ? "Masukkan PIN Anda untuk mengakhiri shift sendiri."
                    : "Masukkan PIN Anda untuk mencatat awal shift."}
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <PinPad
                key={action}
                busy={busy}
                onSubmit={(pin) => void submit(pin)}
                label={
                  loginEntry
                    ? "Masuk kasir"
                    : action === "clock-in"
                      ? "Mulai kerja"
                      : action === "switch"
                        ? "Jadi kasir"
                        : "Selesai kerja"
                }
              />
            </>
          )}
        </Modal>
      )}
      {farewell && (
        <SessionFarewell summary={farewell} onClose={closeFarewell} />
      )}
    </div>
  );
}
