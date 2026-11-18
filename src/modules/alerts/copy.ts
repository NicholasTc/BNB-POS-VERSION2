import type { OwnerAlert } from "./types";
import type { OwnerLanguage } from "@/lib/owner-language";
export function alertCopy(
  alert: Pick<OwnerAlert, "reason" | "count">,
  language: OwnerLanguage,
) {
  const n = alert.count.toLocaleString(language === "en" ? "en-US" : "id-ID");
  const copy = {
    categories: [
      ["Menu belum dikategorikan", "Products need categories"],
      [
        `${n} menu tersedia belum memiliki kategori. Pilih Minuman atau Makanan agar mudah ditemukan.`,
        `${n} available ${alert.count === 1 ? "product has" : "products have"} no category. Assign Drinks or Food so staff can find them.`,
      ],
    ],
    "stock-low": [
      ["Stok menipis", "Stock running low"],
      [
        `${n} barang mencapai batas pengingat. Periksa stok dan catat barang yang datang.`,
        `${n} ${alert.count === 1 ? "supply has" : "supplies have"} reached the reminder threshold. Review stock and record deliveries.`,
      ],
    ],
    "stock-negative": [
      ["Ada stok minus", "Negative stock balances"],
      [
        `${n} barang memiliki stok minus. Penjualan tetap tercatat; periksa pemakaian dan jumlah fisik.`,
        `${n} ${alert.count === 1 ? "supply has a negative balance" : "supplies have negative balances"}. Sales remain recorded; check usage and physical quantities.`,
      ],
    ],
    "sheets-configuration": [
      ["Periksa pengaturan spreadsheet", "Check spreadsheet setup"],
      [
        "Pengaturan salinan spreadsheet belum cocok. Data utama tetap tersimpan di POS.",
        "Spreadsheet copy settings need attention. The main records remain stored in the POS.",
      ],
    ],
    "sheets-failed": [
      ["Salinan spreadsheet tertunda", "Spreadsheet copy needs attention"],
      [
        "Ada kegagalan penyalinan. Buka status spreadsheet; jangan masukkan ulang penjualan atau kehadiran.",
        "Copying has encountered an error. Check spreadsheet status; do not re-enter sales or attendance.",
      ],
    ],
    "sheets-stale": [
      [
        "Layanan penyalinan tidak merespons",
        "Spreadsheet worker is not checking in",
      ],
      [
        "Belum ada pemeriksaan dalam 2 menit terakhir. Periksa layanan penyalinan; data POS tetap tersimpan.",
        "No check-in in the last 2 minutes. Check the copy service; POS records remain stored.",
      ],
    ],
    "sheets-delayed": [
      ["Antrean spreadsheet tertunda", "Spreadsheet queue is delayed"],
      [
        `${n} catatan menunggu disalin, termasuk yang lebih dari 2 menit. Periksa status penyalinan.`,
        `${n} records await copying, including records older than 2 minutes. Check copy status.`,
      ],
    ],
    "payment-pending": [
      ["Pesanan menunggu konfirmasi", "An order awaits payment confirmation"],
      [
        "Pesanan belum selesai setelah 15 menit. Periksa status bersama kasir asal sebelum meminta pembayaran atau membatalkan.",
        "An order is still pending after 15 minutes. Check with the original cashier before collecting payment or cancelling.",
      ],
    ],
    "payment-paid": [
      [
        "Pembayaran tercatat, penjualan belum selesai",
        "Payment recorded, sale unfinished",
      ],
      [
        "Pembayaran sudah dicatat lebih dari 2 menit lalu. Gunakan pemulihan transaksi yang sama bersama kasir asal. Jangan meminta pembayaran lagi.",
        "Payment was recorded over 2 minutes ago. Recover the same transaction with the original cashier. Do not collect payment again.",
      ],
    ],
  } as const;
  const entry = copy[alert.reason],
    index = language === "en" ? 1 : 0;
  return { title: entry[0][index], description: entry[1][index] };
}
