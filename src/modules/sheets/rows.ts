import type { DiscountSnapshot } from "@/modules/promos/rules";
export const tabs = ["Sales", "Attendance"] as const;
export type Tab = (typeof tabs)[number];
// Retained only to recognize and preserve the retired detail tab and row map.
export const legacyItemHeaders = [
  "Line ID",
  "Sale ID",
  "Referensi",
  "ID menu",
  "Menu",
  "Jumlah",
  "Harga satuan (IDR)",
  "Subtotal (IDR)",
];
export type RowMapping = {
  tab: Tab | "Sale items";
  sourceId: string;
  rowNumber: number;
};
export const headers: Record<Tab, string[]> = {
  Sales: [
    "Sale ID",
    "Referensi",
    "Waktu selesai (WIB)",
    "ID kasir",
    "Kasir",
    "Pembayaran",
    "Total (IDR)",
    "Jumlah item",
    "Status",
    "Rincian item (IDR)",
  ],
  Attendance: [
    "Shift ID",
    "ID karyawan",
    "Karyawan",
    "Masuk (WIB)",
    "Keluar (WIB)",
    "Durasi (jam)",
    "Status",
  ],
};
export type Cell = string | number;
export type ExportRow = {
  tab: Tab;
  sourceId: string;
  jobId: number;
  values: Cell[];
};
// Sheets serial dates in Jakarta wall time. Real numeric dates remain sortable.
export const sheetDate = (date: Date) =>
  (date.getTime() + 7 * 3600000) / 86400000 + 25569;
export function saleRows(
  sale: {
    id: string;
    reference: string;
    completed_at: Date;
    cashier_id: string;
    cashier_name: string;
    payment_method: string;
    total: number;
  },
  lines: {
    id: string;
    menu_item_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[],
  jobId: number,
  discountSnapshot?: DiscountSnapshot | null,
): ExportRow[] {
  return [
    {
      tab: "Sales",
      sourceId: sale.id,
      jobId,
      values: [
        sale.id,
        sale.reference,
        sheetDate(sale.completed_at),
        sale.cashier_id,
        sale.cashier_name,
        sale.payment_method === "cash" ? "Tunai" : "QRIS",
        sale.total,
        lines.reduce((n, l) => n + l.quantity, 0),
        "completed",
        [
          lines
            .map(
              (l) =>
                `${l.name} ×${l.quantity} @ Rp${l.unit_price.toLocaleString("id-ID")} = Rp${l.subtotal.toLocaleString("id-ID")}`,
            )
            .join("\n"),
          ...(discountSnapshot
            ? [
                `Sebelum diskon: Rp${discountSnapshot.grossTotal.toLocaleString("id-ID")}`,
                ...discountSnapshot.applied.map(
                  (p) =>
                    `${p.name} (${p.percent}%): -Rp${p.discount.toLocaleString("id-ID")}`,
                ),
                `Total diskon: Rp${discountSnapshot.discount.toLocaleString("id-ID")}`,
                `Total dibayar: Rp${sale.total.toLocaleString("id-ID")}`,
              ]
            : []),
        ].join("\n"),
      ],
    },
  ];
}
export function attendanceRow(
  shift: {
    id: string;
    employee_id: string;
    name: string;
    clock_in: Date;
    clock_out: Date | null;
  },
  jobId: number,
): ExportRow {
  return {
    tab: "Attendance",
    sourceId: shift.id,
    jobId,
    values: [
      shift.id,
      shift.employee_id,
      shift.name,
      sheetDate(shift.clock_in),
      shift.clock_out ? sheetDate(shift.clock_out) : "",
      shift.clock_out
        ? (shift.clock_out.getTime() - shift.clock_in.getTime()) / 3600000
        : "",
      shift.clock_out ? "finished" : "working",
    ],
  };
}
export type MappedRow = ExportRow & { rowNumber: number };
export const cellRange = (tab: Tab, row: number) =>
  `'${tab}'!A${row}:${String.fromCharCode(64 + headers[tab].length)}${row}`;
export const retryDelay = (attempts: number) =>
  Math.min(3600, 5 * 2 ** Math.min(attempts, 10));
