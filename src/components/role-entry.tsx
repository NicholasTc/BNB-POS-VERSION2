"use client";
import Link from "next/link";
import { AccessShell, AccessIcon, CASHIER_LOGIN_PATH } from "./access-shell";

/** Public navigation only: choosing owner never mounts the cashier logout/load flow. */
export function RoleEntry() {
  return <AccessShell mode="home">
    <div className="access-welcome-heading"><h1>Selamat datang di BnB.</h1><p>Pilih akses Anda.</p></div>
    <div className="access-role-grid">
      <section className="access-role-card" aria-labelledby="owner-choice">
        <div className="access-role-heading"><span className="access-role-icon"><AccessIcon name="chart" /></span><h2 id="owner-choice">Dasbor pemilik</h2></div>
        <p>Lihat penjualan dan kelola kafe.</p>
        <Link className="access-primary" href="/owner">Masuk sebagai pemilik</Link>
        <small><AccessIcon name="check" />Di perangkat pribadi, tanpa penyiapan kasir.</small>
      </section>
      <section className="access-role-card" aria-labelledby="cashier-choice">
        <div className="access-role-heading"><span className="access-role-icon"><AccessIcon name="device" /></span><h2 id="cashier-choice">Kasir</h2></div>
        <p>Catat pesanan dan pembayaran.</p>
        <Link className="access-primary" href={CASHIER_LOGIN_PATH}>Masuk sebagai kasir</Link>
        <small><AccessIcon name="lock" />Gunakan PIN di perangkat kasir yang terhubung.</small>
      </section>
    </div>
  </AccessShell>;
}
