"use client";
import { useState } from "react";
import { Modal } from "./modal";
import { PromoBreakdown } from "./promo-breakdown";
import { calculatePromos } from "@/modules/promos/calculate";
import {
  promoEligibility,
  type Promo,
  type PromoLine,
  type PromoSelection,
} from "@/modules/promos/rules";
import { compactRupiah as rupiah } from "@/lib/money";
import "./promos.css";
export function PromoPicker({
  promos,
  lines,
  busy,
  canContinue,
  error,
  onContinue,
  onClose,
  onReload,
}: {
  promos: Promo[];
  lines: PromoLine[];
  busy: boolean;
  canContinue: boolean;
  error: string;
  onContinue: (selected: PromoSelection) => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = promos.filter((p) => selected.includes(p.id));
  const snapshot = calculatePromos(lines, chosen);
  return (
    <Modal
      title="Pilih promo"
      className="pos-payment-sheet"
      busy={busy}
      onClose={onClose}
    >
      <p className="muted">
        Pilih satu atau beberapa promo. Diskon diterapkan berurutan sesuai
        pengaturan pemilik.
      </p>
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button className="secondary" disabled={busy} onClick={onReload}>
            Muat ulang promo
          </button>
        </div>
      )}
      {!canContinue && (
        <p className="error">
          Kasir berubah atau terkunci. Tutup dan masuk kembali sebelum
          melanjutkan.
        </p>
      )}
      <div className="promo-picker-list">
        {[...promos]
          .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
          .map((p) => {
            const reason = promoEligibility(p, lines),
              checked = selected.includes(p.id);
            return (
              <label className="promo-choice" key={p.id}>
                <input
                  type="checkbox"
                  aria-label={p.name}
                  checked={checked}
                  disabled={
                    busy || !!reason || (!checked && selected.length >= 20)
                  }
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, p.id]
                        : s.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>
                  <strong>
                    {p.name} · {p.percent}%
                  </strong>
                  <small>
                    {reason ??
                      (p.scope === "all" ? "Semua menu" : "Menu pilihan")}
                    {p.maxDiscount !== null
                      ? ` · Maks. ${rupiah(p.maxDiscount)}`
                      : ""}
                  </small>
                </span>
              </label>
            );
          })}
      </div>
      {chosen.length > 0 ? (
        <PromoBreakdown
          snapshot={snapshot}
          total={snapshot.grossTotal - snapshot.discount}
        />
      ) : (
        <div className="sheet-total">
          <span>Total tanpa promo</span>
          <strong>{rupiah(snapshot.grossTotal)}</strong>
        </div>
      )}
      <small>
        Belum menerima pembayaran. Nominal akhir akan disimpan dan diperiksa
        sebelum langkah pembayaran.
      </small>
      <button
        disabled={busy || !canContinue}
        onClick={() =>
          onContinue(chosen.map((p) => ({ id: p.id, revision: p.revision })))
        }
      >
        {busy
          ? "Menyiapkan…"
          : chosen.length
            ? `Gunakan ${chosen.length} promo · Lanjut`
            : "Lanjut tanpa promo"}
      </button>
    </Modal>
  );
}
