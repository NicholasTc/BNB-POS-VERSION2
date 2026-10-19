"use client";
import { useEffect } from "react";
import type { SessionFarewell as Farewell } from "@/modules/orders/types";
import { Modal } from "./modal";
import "./orders.css";

export function SessionFarewell({
  summary,
  onClose,
}: {
  summary: Farewell;
  onClose: () => void;
}) {
  useEffect(() => {
    const deadline = Date.now() + 60000;
    const check = () => {
      if (Date.now() >= deadline) onClose();
    };
    const timer = setTimeout(onClose, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [summary.id, onClose]);
  const names = new Intl.ListFormat("id-ID", {
    style: "long",
    type: "conjunction",
  }).format(summary.names);
  return (
    <Modal title="Kerja bagus!" onClose={onClose} className="session-farewell">
      <p className="farewell-team">Terima kasih, {names}.</p>
      <p className="farewell-total">
        <strong>{summary.productsSold.toLocaleString("id-ID")}</strong>
        <span>produk terjual dalam sesi ini</span>
      </p>
      <p className="muted">
        Dari {summary.ordersSold.toLocaleString("id-ID")} transaksi yang
        tersimpan. Semua staf sudah selesai kerja.
      </p>
      {summary.pendingOrders > 0 && (
        <p className="farewell-pending" role="status">
          Masih ada {summary.pendingOrders} pesanan belum selesai disiapkan.
          Pesanan tetap tersimpan untuk dilanjutkan pada sesi berikutnya.
        </p>
      )}
      <p className="muted farewell-dismiss">
        Jendela ini tertutup otomatis setelah 1 menit.
      </p>
    </Modal>
  );
}
