import { it, expect, vi } from "vitest";
import { projectDay } from "../../src/modules/daily-report/project";
import { reportGuard } from "../../src/modules/daily-report/sync";
import {
  dateRange,
  jakartaDate,
  serial,
} from "../../src/modules/daily-report/dates";
import {
  GoogleDailyReport,
  reportFormula,
  statusFormula,
} from "../../src/modules/daily-report/google";
import {
  REPORT_HEADERS,
  REPORT_MARKER,
  type DailySale,
  type ReportPrepare,
} from "../../src/modules/daily-report/types";
import { TEST_SPREADSHEET_ID } from "../../src/modules/sheets/config";
import { calculatePromos } from "../../src/modules/promos/calculate";
import type { Promo } from "../../src/modules/promos/rules";

const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const promo: Promo = {
  id: a,
  revision: 1,
  name: "Halloween",
  percent: 10,
  scope: "all",
  productIds: [],
  minQuantity: 1,
  minDistinct: 1,
  minSpend: 0,
  maxDiscount: null,
  priority: 1,
  active: true,
};
function sale(
  id: string,
  price = 32000,
  name = "Croissant",
  discount = false,
): DailySale {
  const snapshot = discount
    ? calculatePromos([{ id: a, quantity: 1, unitPrice: price }], [promo])
    : null;
  return {
    id,
    total: price - (snapshot?.discount ?? 0),
    discount: snapshot,
    lines: [
      {
        id,
        menuItemId: a,
        name,
        quantity: 1,
        unitPrice: price,
        subtotal: price,
      },
    ],
  };
}
const input: ReportPrepare = {
  today: "2026-11-05",
  earliest: "2026-10-24",
  mappings: [],
  days: 13,
  expectedSheetId: null,
};
it("uses actual discounts for mixed full-price and promo sales, leaving TOTAL blank in the projection", () => {
  const rows = projectDay(
    input.today,
    [sale("one"), sale("two", 32000, "Croissant", true)],
    [{ id: b, name: "Unsold", price: 22000, createdAt: input.today }],
  );
  expect(
    rows.map((r) => [r.name, r.quantity, r.price, r.revenue, r.notes]),
  ).toEqual([
    ["Croissant", 2, 32000, 60800, "Halloween (10%): -Rp3.200"],
    ["Unsold", 0, 22000, 0, ""],
  ]);
});
it("reconciles sequential capped product allocations exactly without consulting current promos", () => {
  const lines = [
    { id: a, quantity: 3, unitPrice: 12347 },
    { id: b, quantity: 2, unitPrice: 9999 },
  ];
  const snapshot = calculatePromos(lines, [
    promo,
    {
      ...promo,
      id: b,
      percent: 23,
      priority: 2,
      scope: "selected",
      productIds: [a],
      maxDiscount: 1234,
    },
  ]);
  const rows = projectDay(
    input.today,
    [
      {
        id: "multi",
        total: snapshot.grossTotal - snapshot.discount,
        discount: snapshot,
        lines: lines.map((l) => ({
          id: l.id,
          menuItemId: l.id,
          name: l.id === a ? "A" : "B",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.quantity * l.unitPrice,
        })),
      },
    ],
    [],
  );
  expect(rows.reduce((n, r) => n + r.revenue, 0)).toBe(
    snapshot.grossTotal - snapshot.discount,
  );
  expect(rows[0].notes).toContain("23%");
  expect(rows[1].notes).not.toContain("23%");
  snapshot.allocations[0].discount++;
  expect(() =>
    projectDay(
      input.today,
      [
        {
          id: "bad",
          total: 1,
          discount: snapshot,
          lines: lines.map((l) => ({
            id: l.id,
            menuItemId: l.id,
            name: "A",
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            subtotal: l.quantity * l.unitPrice,
          })),
        },
      ],
      [],
    ),
  ).toThrow("discount_mismatch");
});
it("keeps historical names/prices separate, preserves unknown unsold prices and never infers bundles", () => {
  const rows = projectDay(
    input.today,
    [sale("a"), sale("b", 35000), sale("c", 35000, "New name")],
    [
      { id: a, name: "Today name", price: 50000, createdAt: input.today },
      { id: b, name: "Unknown old menu", price: null, createdAt: input.today },
    ],
  );
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.revenue).reduce((a, b) => a + b)).toBe(102000);
  expect(rows.find((r) => r.name === "Unknown old menu")?.price).toBeNull();
  expect(rows.some((r) => r.name === "Today name")).toBe(false);
});
it("fails closed on inconsistent totals, duplicate records and unsafe numeric source", () => {
  expect(() =>
    projectDay(input.today, [{ ...sale("a"), total: 1 }], []),
  ).toThrow("revenue_mismatch");
  expect(() => projectDay(input.today, [sale("a"), sale("a")], [])).toThrow(
    "invalid_source",
  );
  expect(() =>
    projectDay(input.today, [sale("a", Number.MAX_SAFE_INTEGER + 1)], []),
  ).toThrow("invalid_source");
});
it("uses Jakarta midnight and bounded calendar ranges independent of host timezone", () => {
  expect(jakartaDate(new Date("2026-11-04T16:59:59Z"))).toBe("2026-11-04");
  expect(jakartaDate(new Date("2026-11-04T17:00:00Z"))).toBe("2026-11-05");
  expect(dateRange("2024-02-28", "2024-03-01")).toEqual([
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
  expect(serial("2026-11-05") - serial("2026-11-04")).toBe(1);
  expect(() => dateRange("2000-01-01", input.today)).toThrow("report_capacity");
});
it("explicitly blocks production, wrong sheets and pg URL overrides before any connection", () => {
  const config = { mode: "test" as const, spreadsheetId: TEST_SPREADSHEET_ID };
  expect(() =>
    reportGuard(config, "postgresql://u:p@127.0.0.1:55439/lisi_test"),
  ).not.toThrow();
  for (const url of [
    "postgresql://u:p@railway.internal/prod",
    "postgresql://u:p@127.0.0.1/lisi_test?host=evil",
    "postgresql://u:p@127.0.0.1/prod",
  ])
    expect(() => reportGuard(config, url)).toThrow("test_environment_required");
  expect(() =>
    reportGuard(
      { ...config, mode: "live" },
      "postgresql://u:p@127.0.0.1/lisi_dev",
    ),
  ).toThrow("test_environment_required");
});
it("creates only Laporan Harian and sends untrusted names as literal cells", async () => {
  const call = vi.fn(async (path: string) =>
    path.startsWith("?fields")
      ? {
          sheets: [
            {
              properties: {
                sheetId: 1,
                title: "Sales",
                gridProperties: { rowCount: 1000, columnCount: 10 },
              },
            },
            {
              properties: {
                sheetId: 2,
                title: "Attendance",
                gridProperties: { rowCount: 1000, columnCount: 7 },
              },
            },
          ],
        }
      : {},
  );
  const transport = new GoogleDailyReport({ call });
  await transport.prepare(input);
  await transport.write({
    date: input.today,
    statusRow: 6,
    publishedAt: "2026-11-05T00:00:00Z",
    note: "",
    rows: [
      {
        rowNumber: 6,
        values: [
          serial(input.today),
          '=IMPORTXML("evil")',
          1,
          "",
          10000,
          10000,
          "",
          a,
        ],
      },
    ],
  });
  const payloads = JSON.stringify(call.mock.calls);
  expect(payloads).toContain("Laporan Harian");
  expect(payloads).not.toContain('"sheetId":1,');
  expect(payloads).toContain('"stringValue":"=IMPORTXML');
  expect(payloads).not.toContain('"formulaValue":"=IMPORTXML');
  expect(payloads).toContain("HARGA JUAL");
});
it("refuses foreign tabs, moved keys or edited formulas; never rewrites the chosen date on retries", async () => {
  const keys: (string | number)[][] = [];
  const top: (string | number)[][] = [
    ["LAPORAN PENJUALAN HARIAN", "", "", "", "", "", "", REPORT_MARKER],
    ["", 46000],
    [statusFormula(1000)],
    [...REPORT_HEADERS],
    [reportFormula(1000)],
  ];
  const call = vi.fn(async (path: string) =>
    path.startsWith("?fields")
      ? {
          sheets: [
            {
              properties: {
                sheetId: 81004,
                title: "Laporan Harian",
                gridProperties: { rowCount: 1000, columnCount: 18 },
              },
            },
          ],
        }
      : path.includes(encodeURIComponent("A1:R5"))
        ? { values: top }
        : path.includes(encodeURIComponent("O6:O1000"))
          ? { values: keys }
          : {},
  );
  await new GoogleDailyReport({ call }).prepare({
    ...input,
    expectedSheetId: 81004,
  });
  const writes = call.mock.calls.filter((c) => c[0] === ":batchUpdate");
  expect(JSON.stringify(writes)).not.toContain('"columnIndex":1');
  top[0][7] = "foreign";
  await expect(new GoogleDailyReport({ call }).prepare(input)).rejects.toThrow(
    "report_layout_conflict",
  );
  top[0][7] = REPORT_MARKER;
  top[4][0] = "=1";
  await expect(new GoogleDailyReport({ call }).prepare(input)).rejects.toThrow(
    "report_layout_conflict",
  );
  top[4][0] = reportFormula(1000);
  top[3][0] = "Changed header";
  await expect(new GoogleDailyReport({ call }).prepare(input)).rejects.toThrow(
    "report_layout_conflict",
  );
  top[3][0] = REPORT_HEADERS[0];
  keys.push(["moved-or-unrecognized-key"]);
  await expect(new GoogleDailyReport({ call }).prepare(input)).rejects.toThrow(
    "report_layout_conflict",
  );
  expect(call.mock.calls.filter((c) => c[0] === ":batchUpdate")).toHaveLength(
    1,
  );
});
