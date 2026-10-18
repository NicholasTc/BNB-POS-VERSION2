"use client";
import { useState } from "react";
import { Modal } from "./modal";
import { PosIcon } from "./pos-icons";
import { cashAmount, cashKey, cashSuggestions } from "@/lib/cash";
import { compactRupiah as rupiah } from "@/lib/money";
export type PaymentQuote = {
  id: string;
  total: number;
  paymentMethod: "cash" | "qris";
  status: "pending" | "paid" | "completed" | "cancelled";
  reference: string;
  cashierName: string;
};
export function PaymentSheet({
  quote,
  busy,
  canPay,
  uncertain,
  error,
  onSave,
  onCheck,
  onCancel,
  onClose,
}: {
  quote: PaymentQuote;
  busy: boolean;
  canPay: boolean;
  uncertain: boolean;
  error: string;
  onSave: () => void;
  onCheck: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [received, setReceived] = useState("");
  const [verified, setVerified] = useState(false);
  const amount = cashAmount(received);
  const paid = quote.status === "paid";
  const cash = quote.paymentMethod === "cash";
  const valid =
    paid || (cash ? amount !== null && amount >= quote.total : verified);
  return (
    <Modal
      title={cash ? "Tunai" : "QRIS"}
      busy={busy}
      onClose={onClose}
      className="pos-payment-sheet"
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!canPay && !busy && (
        <p className="payment-warning">
          Masukkan PIN {quote.cashierName} melalui Ganti kasir jika kasir
          terkunci.
        </p>
      )}
      {uncertain && (
        <div className="payment-warning">
          <p>
            Jangan meminta pembayaran lagi. Periksa status transaksi dengan
            referensi yang sama.
          </p>
          <button className="secondary" disabled={busy} onClick={onCheck}>
            Periksa status transaksi
          </button>
        </div>
      )}
      {cash ? (
        <>
          <div className="sheet-total">
            <span>Total</span>
            <strong>{rupiah(quote.total)}</strong>
          </div>
          <div className="cash-entry">
            <label htmlFor="cash-received">Uang diterima</label>
            <input
              id="cash-received"
              inputMode="numeric"
              autoComplete="off"
              value={received ? rupiah(Number(received)) : ""}
              placeholder="Rp0"
              disabled={busy || !canPay || paid}
              onChange={(e) => {
                const value = e.target.value
                  .replace(/[^0-9]/g, "")
                  .replace(/^0+(?=\d)/, "");
                if (value === "" || cashAmount(value) !== null)
                  setReceived(value);
              }}
            />
          </div>
          <div className="cash-suggestions">
            {cashSuggestions(quote.total).map((value, index) => (
              <button
                key={value}
                className={
                  amount === value ? "secondary selected" : "secondary"
                }
                disabled={busy || !canPay || paid}
                onClick={() => setReceived(String(value))}
              >
                {index === 0 ? "Uang pas" : rupiah(value)}
              </button>
            ))}
          </div>
          <div className="cash-change" role="status">
            <span>Kembalian</span>
            <strong>
              {rupiah(
                amount !== null && amount >= quote.total
                  ? amount - quote.total
                  : 0,
              )}
            </strong>
            {amount !== null && amount < quote.total && (
              <small>Uang diterima belum cukup.</small>
            )}
          </div>
          <div className="cash-keypad">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "000",
              "0",
              "backspace",
            ].map((key) => (
              <button
                key={key}
                className="secondary"
                aria-label={key === "backspace" ? "Hapus angka" : key}
                disabled={busy || !canPay || paid}
                onClick={() => setReceived((value) => cashKey(value, key))}
              >
                {key === "backspace" ? "⌫" : key}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="qris-total">
            <span>Total pembayaran</span>
            <strong>{rupiah(quote.total)}</strong>
          </div>
          <div className="qris-instruction">
            <span className="scan-mark">
              <PosIcon name="qris" />
            </span>
            <div>
              <strong>Minta pelanggan scan QRIS toko</strong>
              <p>Pastikan nominalnya {rupiah(quote.total)}.</p>
            </div>
          </div>
          <ol className="merchant-steps">
            <li>Cek pembayaran di aplikasi merchant.</li>
            <li>Cocokkan nominal dan transaksi terbaru.</li>
          </ol>
          <p
            className={`qris-status ${paid || verified ? "confirmed" : ""}`}
            role="status"
          >
            <span />
            {paid
              ? "Pembayaran dicatat"
              : verified
                ? "Sudah saya cek"
                : "Belum dikonfirmasi"}
          </p>
          {!paid && (
            <label className="qris-confirm">
              <input
                type="checkbox"
                checked={verified}
                disabled={busy || !canPay}
                onChange={(e) => setVerified(e.target.checked)}
              />
              Pembayaran {rupiah(quote.total)} sudah saya cek masuk
            </label>
          )}
        </>
      )}
      {paid && (
        <p className="payment-saved" role="status">
          Penerimaan pembayaran telah dicatat oleh kasir. Lanjutkan penyimpanan
          tanpa meminta pembayaran lagi.
        </p>
      )}
      <button
        className="payment-save"
        disabled={busy || !canPay || !valid}
        onClick={onSave}
      >
        {busy
          ? "Menyimpan…"
          : cash
            ? "Uang diterima · Simpan"
            : "Pembayaran diterima · Simpan"}
      </button>
      <small className="sheet-caption">
        {cash
          ? "Tekan setelah uang diterima."
          : "Aktif setelah pembayaran dicentang."}
      </small>
      <details className="transaction-details">
        <summary>Rincian transaksi</summary>
        <p className="reference">{quote.reference}</p>
        <p>Kasir {quote.cashierName}. Harga ini telah disimpan.</p>
        {!paid && !uncertain && (
          <button
            className="text-button"
            disabled={busy || !canPay}
            onClick={onCancel}
          >
            Kembali, belum dibayar
          </button>
        )}
      </details>
    </Modal>
  );
}
