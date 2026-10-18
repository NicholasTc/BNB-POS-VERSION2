"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import { api, ApiError } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { PinPad } from "./pin-pad";
import { Sales, type SalesHandle } from "./sales";
import { Modal } from "./modal";
import { LisiLogo, PosIcon } from "./pos-icons";
import "./cashier.css";
export type PosState = {
  paired: true;
  shifts: { id: string; employeeId: string; name: string; clockIn: string }[];
  cashier: { employeeId: string; name: string } | null;
  generation: number;
  expiresAt: string | null;
};
export function Pos() {
  const salesRef = useRef<SalesHandle>(null);
  const handoffReady = useRef(false);
  const [state, setState] = useState<PosState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [staffOpen, setStaffOpen] = useState(false),
    [action, setAction] = useState<"clock-in" | "switch" | "clock-out">(
      "clock-in",
    ),
    [dialog, setDialog] = useState(false),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      if (!handoffReady.current) {
        await api("/api/auth/sign-out", {});
        handoffReady.current = true;
      }
      setState(await api<PosState>("/api/pos"));
      setError("");
    } catch (e) {
      if (!handoffReady.current || (e instanceof ApiError && e.status === 401))
        setState(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const onRestore = () => {
      handoffReady.current = false;
      void refresh();
    };
    window.addEventListener("pageshow", onRestore);
    return () => window.removeEventListener("pageshow", onRestore);
  }, [refresh]);
  const refreshStatus = useCallback(async (signal: AbortSignal) => {
    try {
      const current = await api<PosState>("/api/pos", undefined, { signal });
      if (!signal.aborted) setState(current);
    } catch (e) {
      if (!signal.aborted && e instanceof ApiError && e.status === 401) {
        setState(null);
        setError(e.message);
      }
      // Temporary connectivity does not clear a cart or a financial error.
    }
  }, []);
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
      await api("/api/pos", { action, pin });
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(value: typeof action) {
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
    setDialog(true);
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
      <main className={state ? "content stack" : "center-stage stack"}>
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
                onClick={() =>
                  open(state.shifts.length ? "switch" : "clock-in")
                }
              >
                Masuk
              </button>
            )}
          </section>
        )}
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
        {loading ? (
          <p role="status">Memuat kasir…</p>
        ) : !state ? (
          <div className="card stack">
            <h1>Siap menyambut hari?</h1>
            <p className="muted">
              Kasir terkunci. Pemilik perlu menghubungkan perangkat ini sebelum
              karyawan mulai bekerja.
            </p>
            <Link className="button" href="/owner">
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
          </div>
        ) : (
          <Sales ref={salesRef} state={state} />
        )}
      </main>
      {dialog && (
        <Modal
          title={
            action === "clock-in"
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
            busy={busy}
            onSubmit={(pin) => void submit(pin)}
            label={
              action === "clock-in"
                ? "Mulai kerja"
                : action === "switch"
                  ? "Jadi kasir"
                  : "Selesai kerja"
            }
          />
        </Modal>
      )}
    </div>
  );
}
