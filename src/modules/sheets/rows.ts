export const tabs = ["Sales", "Sale items", "Attendance"] as const;
export type Tab = (typeof tabs)[number];
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
  ],
  "Sale items": [
    "Line ID",
    "Sale ID",
    "Referensi",
    "ID menu",
    "Menu",
    "Jumlah",
    "Harga satuan (IDR)",
    "Subtotal (IDR)",
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
      ],
    },
    ...lines.map((l) => ({
      tab: "Sale items" as const,
      sourceId: l.id,
      jobId,
      values: [
        l.id,
        sale.id,
        sale.reference,
        l.menu_item_id,
        l.name,
        l.quantity,
        l.unit_price,
        l.subtotal,
      ],
    })),
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
