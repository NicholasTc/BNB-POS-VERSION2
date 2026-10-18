/** Calendar-day presets; the caller supplies today's Asia/Jakarta date. */
export function datePreset(
  preset: "today" | "yesterday" | "week",
  today: string,
) {
  const shift = (days: number) => {
    const date = new Date(today + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return preset === "yesterday"
    ? { from: shift(-1), to: shift(-1) }
    : { from: preset === "week" ? shift(-6) : today, to: today };
}
