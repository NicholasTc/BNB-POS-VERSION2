import { DailyReportError, MAX_REPORT_DAYS } from "./types";

/** Convert a timestamp to its Jakarta business-date key for report discovery and filtering. */
export function jakartaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Convert a report date/timestamp into the numeric Google Sheets date serial used by the date selector/formulas. */
export function serial(date: string) {
  const time = Date.parse(date.length === 10 ? date + "T00:00:00Z" : date);
  if (!Number.isFinite(time)) throw new DailyReportError("invalid_date");
  return time / 86400000 + 25569;
}
/** Enumerate a validated bounded inclusive calendar-date range for report discovery. */
export function dateRange(first: string, last: string) {
  const days = Math.round(serial(last) - serial(first)) + 1;
  if (days < 1 || days > MAX_REPORT_DAYS)
    throw new DailyReportError("report_capacity");
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.parse(first + "T00:00:00Z") + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}
