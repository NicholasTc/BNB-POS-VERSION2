import Link from "next/link";
import { AccessShell, AccessIcon, DeviceIllustration } from "./access-shell";

/** Show only the observed authorization/connection state; retry uses the existing loader. */
export function CashierEntry({ loading, deviceRequired, checking, error, onRetry }: {
  loading: boolean; deviceRequired: boolean; checking: boolean; error: string; onRetry: () => void;
}) {
  return <AccessShell setup={deviceRequired}>
    <Link className="access-back" href="/"><AccessIcon name="back" />Pilihan akses</Link>
    {loading ? <><h1 id="access-title">Memuat kasir…</h1><p className="access-description" role="status">Memeriksa akses perangkat.</p></> : deviceRequired ? <>
      <div className="access-state"><AccessIcon name="device" />Belum disiapkan</div>
      <DeviceIllustration />
      <h1 id="access-title">Siapkan kasir di sini.</h1>
      <p className="access-description">Minta pemilik menyiapkan perangkat ini untuk mulai memakai PIN.</p>
      <Link className="access-primary" href="/owner?setup=cashier">Siapkan kasir</Link>
      <button className="access-quiet access-recheck" disabled={checking} onClick={onRetry}><AccessIcon name="refresh" />{checking ? "Memeriksa…" : "Sudah disiapkan? Periksa"}</button>
      <details className="access-help"><summary>Kenapa perlu disiapkan?</summary><p>Pemilik mengizinkan browser ini untuk dipakai sebagai kasir selama 90 hari. PIN karyawan tidak membuka dasbor pemilik.</p></details>
    </> : <>
      <div className="access-state"><AccessIcon name="offline" />Belum dapat terhubung</div>
      <h1 id="access-title">Periksa koneksi internet.</h1>
      <p className="access-description">Kami belum bisa memeriksa akses kasir.</p>
      {error && <p className="access-error" role="alert">{error}</p>}
      <button className="access-primary" disabled={checking} onClick={onRetry}>{checking ? "Memeriksa…" : "Coba lagi"}</button>
      <details className="access-help"><summary>Apa yang perlu dilakukan?</summary><p>Pastikan internet terhubung. Jangan hubungkan ulang perangkat hanya karena koneksi terputus.</p></details>
    </>}
  </AccessShell>;
}
