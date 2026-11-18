import { DailyReportError, MAX_REPORT_DAYS } from "./types";

export function jakartaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function serial(date: string) {
  const time = Date.parse(date.length === 10 ? date + "T00:00:00Z" : date);
  if (!Number.isFinite(time)) throw new DailyReportError("invalid_date");
  return time / 86400000 + 25569;
}
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
