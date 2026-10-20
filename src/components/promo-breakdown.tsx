import { compactRupiah as rupiah } from "@/lib/money";
import type { DiscountSnapshot } from "@/modules/promos/rules";
export function PromoBreakdown({
  snapshot,
  total,
  english = false,
}: {
  snapshot?: DiscountSnapshot | null;
  total: number;
  english?: boolean;
}) {
  if (!snapshot) return null;
  return (
    <div
      className="promo-breakdown"
      aria-label={english ? "Discount breakdown" : "Rincian diskon"}
    >
      <div>
        <span>{english ? "Before discount" : "Sebelum diskon"}</span>
        <span>{rupiah(snapshot.grossTotal)}</span>
      </div>
      {snapshot.applied.map((p) => (
        <div className="promo-saving" key={p.id}>
          <span>
            {p.name} ({p.percent}%)
          </span>
          <strong>−{rupiah(p.discount)}</strong>
        </div>
      ))}
      <div>
        <strong>{english ? "Total to pay" : "Total dibayar"}</strong>
        <strong>{rupiah(total)}</strong>
      </div>
    </div>
  );
}
