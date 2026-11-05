import { createHash } from "node:crypto";
import { calculatePromos } from "@/modules/promos/calculate";
import { promoRules } from "@/modules/promos/rules";
import {
  DailyReportError,
  type CatalogItem,
  type DailyRow,
  type DailySale,
} from "./types";
export const hashReport = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safe = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new DailyReportError("invalid_source");
  return n;
};
export function projectDay(
  date: string,
  sales: DailySale[],
  catalog: CatalogItem[],
): DailyRow[] {
  type Build = DailyRow & { menuItemId: string; promos: Map<string, number> };
  const rows = new Map<string, Build>(),
    sold = new Set<string>(),
    saleIds = new Set<string>();
  for (const sale of sales) {
    if (saleIds.has(sale.id)) throw new DailyReportError("invalid_source");
    saleIds.add(sale.id);
    safe(sale.total);
    const ids = new Set<string>();
    for (const line of sale.lines) {
      if (
        ids.has(line.menuItemId) ||
        !line.name ||
        line.name.length > 80 ||
        !line.quantity ||
        !line.unitPrice
      )
        throw new DailyReportError("invalid_source");
      ids.add(line.menuItemId);
      safe(line.quantity);
      safe(line.unitPrice);
      safe(line.subtotal);
      if (line.subtotal !== line.quantity * line.unitPrice)
        throw new DailyReportError("invalid_source");
    }
    if (!sale.lines.length) throw new DailyReportError("invalid_source");
    const promoAmounts = new Map<string, Map<string, number>>();
    const discounts = new Map<string, number>();
    if (sale.discount) {
      // Replay only saved rules against immutable lines, never today's promos.
      // Prefix differences expose exact per-promo product allocations without
      // changing or duplicating the authoritative pricing algorithm.
      const inputs = sale.lines.map((l) => ({
        id: l.menuItemId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }));
      const promos = sale.discount.applied.map((p) => ({
        ...promoRules.parse(p.rules),
        id: p.id,
        revision: p.revision,
      }));
      let previous = new Map<string, number>();
      for (let i = 0; i < promos.length; i++) {
        const calculated = calculatePromos(inputs, promos.slice(0, i + 1));
        const recorded = sale.discount.applied[i];
        const last = calculated.applied.at(-1)!;
        if (
          last.id !== recorded.id ||
          last.discount !== recorded.discount ||
          last.name !== recorded.name ||
          last.percent !== recorded.percent
        )
          throw new DailyReportError("discount_mismatch");
        for (const allocation of calculated.allocations) {
          const amount =
            allocation.discount - (previous.get(allocation.id) ?? 0);
          safe(amount);
          if (amount) {
            const amounts =
              promoAmounts.get(allocation.id) ?? new Map<string, number>();
            const label = `${recorded.name} (${recorded.percent}%)`;
            amounts.set(label, safe((amounts.get(label) ?? 0) + amount));
            promoAmounts.set(allocation.id, amounts);
          }
        }
        previous = new Map(
          calculated.allocations.map((a) => [a.id, a.discount]),
        );
      }
      for (const a of sale.discount.allocations) {
        if (
          discounts.has(a.id) ||
          !ids.has(a.id) ||
          (previous.get(a.id) ?? 0) !== a.discount
        )
          throw new DailyReportError("discount_mismatch");
        discounts.set(a.id, safe(a.discount));
      }
      if (
        discounts.size !== sale.lines.length ||
        sale.discount.grossTotal !==
          sale.lines.reduce((n, l) => n + l.subtotal, 0) ||
        sale.discount.discount !==
          [...discounts.values()].reduce((n, d) => n + d, 0)
      )
        throw new DailyReportError("discount_mismatch");
    }
    let net = 0;
    for (const line of sale.lines) {
      const revenue = safe(
        line.subtotal - (discounts.get(line.menuItemId) ?? 0),
      );
      net = safe(net + revenue);
      sold.add(line.menuItemId);
      const key = hashReport([
        date,
        line.menuItemId,
        line.name,
        line.unitPrice,
      ]);
      const row = rows.get(key) ?? {
        key,
        menuItemId: line.menuItemId,
        name: line.name,
        quantity: 0,
        price: line.unitPrice,
        revenue: 0,
        notes: "",
        promos: new Map<string, number>(),
      };
      row.quantity = safe(row.quantity + line.quantity);
      row.revenue = safe(row.revenue + revenue);
      for (const [label, amount] of promoAmounts.get(line.menuItemId) ?? [])
        row.promos.set(label, safe((row.promos.get(label) ?? 0) + amount));
      rows.set(key, row);
    }
    if (net !== sale.total) throw new DailyReportError("revenue_mismatch");
  }
  const unique = new Set<string>();
  for (const item of catalog) {
    if (unique.has(item.id) || !item.name || item.name.length > 80)
      throw new DailyReportError("invalid_catalog");
    unique.add(item.id);
    if (sold.has(item.id)) continue;
    if (item.price !== null) safe(item.price);
    const key = hashReport([date, item.id, item.name, item.price]);
    rows.set(key, {
      key,
      menuItemId: item.id,
      name: item.name,
      quantity: 0,
      price: item.price,
      revenue: 0,
      notes: "",
      promos: new Map(),
    });
  }
  const result = [...rows.values()]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "id-ID") ||
        (a.price ?? -1) - (b.price ?? -1) ||
        a.key.localeCompare(b.key),
    )
    .map((row) => {
      const notes = [...row.promos.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "id-ID"))
        .map(
          ([label, amount]) => `${label}: -Rp${amount.toLocaleString("id-ID")}`,
        )
        .join("\n");
      if (notes.length > 45000)
        throw new DailyReportError("report_cell_too_large");
      return {
        key: row.key,
        name: row.name,
        quantity: row.quantity,
        price: row.price,
        revenue: row.revenue,
        notes,
      };
    });
  if (
    result.reduce((n, r) => safe(n + r.revenue), 0) !==
    sales.reduce((n, s) => safe(n + s.total), 0)
  )
    throw new DailyReportError("revenue_mismatch");
  return result.length
    ? result
    : [
        {
          key: hashReport([date, "empty"]),
          name: "Belum ada menu",
          quantity: 0,
          price: null,
          revenue: 0,
          notes: "",
        },
      ];
}
