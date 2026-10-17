"use client";
import { useState } from "react";
import { api } from "@/lib/client";
export function DeviceSettings() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function change(action: "pair" | "revoke") {
    if (
      !window.confirm(
        action === "pair"
          ? "Hubungkan perangkat ini? Perangkat lama akan terkunci dan kasir perlu memasukkan PIN kembali."
          : "Putuskan akses perangkat kasir? Shift karyawan tetap tercatat.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("/api/owner/device", { action });
      setMessage(
        action === "pair"
          ? "Perangkat terhubung selama 30 hari. Buka Kasir untuk mulai."
          : "Akses perangkat diputus.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>Perangkat kasir</h2>
      <p className="muted">
        Satu perangkat bersama. Menghubungkan ulang mencabut akses perangkat
        sebelumnya; shift tetap tercatat.
      </p>
      <div className="row">
        <button disabled={busy} onClick={() => void change("pair")}>
          Hubungkan perangkat ini
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => void change("revoke")}
        >
          Putuskan akses
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
