export const REPORT_TAB = "Laporan Harian";
export const REPORT_MARKER = "lisi.daily-report/v1";
export const REPORT_HEADERS = [
  "MENU",
  "JUMLAH TERJUAL",
  "TOTAL",
  "HARGA JUAL",
  "TOTAL OMSET",
  "KETERANGAN",
] as const;
export const FIRST_DATA_ROW = 6;
export const MAX_REPORT_ROWS = 100000;
export const MAX_REPORT_DAYS = 3660;
export type CatalogItem = {
  id: string;
  name: string;
  price: number | null;
  createdAt: string;
};
export type DailyLine = {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};
export type DailySale = {
  id: string;
  total: number;
  lines: DailyLine[];
  discount: import("@/modules/promos/rules").DiscountSnapshot | null;
};
export type DailyRow = {
  key: string;
  name: string;
  quantity: number;
  price: number | null;
  revenue: number;
  notes: string;
};
export type ReportMapping = {
  key: string;
  date: string;
  rowNumber: number;
  active: boolean;
};
export type ReportWrite = {
  date: string;
  rows: { rowNumber: number; values: (string | number)[] }[];
  statusRow: number;
  publishedAt: string;
  note: string;
};
export type ReportPrepare = {
  today: string;
  earliest: string;
  mappings: ReportMapping[];
  days: number;
  expectedSheetId: number | null;
};
export interface DailyTransport {
  prepare(input: ReportPrepare): Promise<number>;
  write(input: ReportWrite): Promise<void>;
}
export class DailyReportError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "DailyReportError";
  }
}
