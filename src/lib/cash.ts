export const MAX_CASH = 2000000000;
export const cashAmount = (value: string) =>
  /^\d{1,10}$/.test(value) && Number(value) <= MAX_CASH ? Number(value) : null;
export function cashKey(value: string, key: string) {
  if (key === "backspace") return value.slice(0, -1);
  const next = (value + key).replace(/^0+(?=\d)/, "");
  return cashAmount(next) === null ? value : next;
}
export function cashSuggestions(total: number) {
  return [
    ...new Set([
      total,
      Math.ceil(total / 10000) * 10000,
      Math.ceil(total / 50000) * 50000,
    ]),
  ];
}
