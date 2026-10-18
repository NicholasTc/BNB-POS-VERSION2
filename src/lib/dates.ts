export const BUSINESS_TIMEZONE = "Asia/Jakarta";
export const businessToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function businessRange(from: string, to: string) {
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Pilih tanggal yang valid.");
    const date = new Date(value + "T00:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error("Pilih tanggal yang valid.");
  }
  const start = new Date(from + "T00:00:00+07:00"),
    end = new Date(new Date(to + "T00:00:00+07:00").getTime() + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
    throw new Error("Pilih rentang berurutan, paling lama 366 hari.");
  return { start, end };
}
export const localTime = (value: string, language: "id" | "en" = "id") =>
  new Intl.DateTimeFormat(language === "en" ? "en-GB" : "id-ID", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
