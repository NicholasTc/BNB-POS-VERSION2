export const rupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
export const compactRupiah = (amount: number) =>
  rupiah(amount).replace(/\s/g, "");
export function priceLines(lines: { unitPrice: number; quantity: number }[]) {
  if (!lines.length || lines.length > 50)
    throw new Error("Pilih 1 sampai 50 jenis menu.");
  const total = lines.reduce((sum, line) => {
    if (
      !Number.isInteger(line.unitPrice) ||
      line.unitPrice < 1 ||
      line.unitPrice > 100000000 ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 99
    )
      throw new Error("Harga atau jumlah menu tidak valid.");
    return sum + line.unitPrice * line.quantity;
  }, 0);
  if (!Number.isSafeInteger(total) || total > 1000000000)
    throw new Error("Total pesanan terlalu besar.");
  return total;
}
