import { describe, it, expect, vi } from "vitest";
import {
  sheetsConfig,
  TEST_SPREADSHEET_ID,
  LIVE_SPREADSHEET_ID,
  SheetsError,
  sheetsErrorCode,
} from "../../src/modules/sheets/config";
import {
  sheetDate,
  attendanceRow,
  retryDelay,
  headers,
  tabs,
  type Tab,
  saleRows,
  legacyItemHeaders,
} from "../../src/modules/sheets/rows";
import { GoogleSheets } from "../../src/modules/sheets/google";
const config = { mode: "test" as const, spreadsheetId: TEST_SPREADSHEET_ID };
const input = {
  SHEETS_SYNC_MODE: "test",
  SHEETS_SPREADSHEET_ID: TEST_SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_FILE: "/private/key.json",
  DATABASE_URL: "postgresql://unused@127.0.0.1/lisi_test",
};
describe("optional Sheets module boundaries", () => {
  it("keeps every historical item on one sale row with numeric totals and the same cashier", () => {
    const rows = saleRows(
      {
        id: "sale",
        reference: "ref",
        completed_at: new Date("2026-10-19T01:00:00Z"),
        cashier_id: "cashier",
        cashier_name: "Ayu",
        payment_method: "cash",
        total: 65000,
      },
      [
        {
          id: "a",
          menu_item_id: "a",
          name: "Juice A",
          quantity: 2,
          unit_price: 20000,
          subtotal: 40000,
        },
        {
          id: "b",
          menu_item_id: "b",
          name: "=Juice B",
          quantity: 1,
          unit_price: 25000,
          subtotal: 25000,
        },
      ],
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tab).toBe("Sales");
    expect(rows[0].values.slice(3)).toEqual([
      "cashier",
      "Ayu",
      "Tunai",
      65000,
      3,
      "completed",
      "Juice A ×2 @ Rp20.000 = Rp40.000\n=Juice B ×1 @ Rp25.000 = Rp25.000",
    ]);
  });
  it("defaults off without requiring Google credentials or changing core config", () => {
    expect(sheetsConfig({})).toBeNull();
    expect(sheetsConfig({ ...input, SHEETS_SYNC_MODE: "off" })).toBeNull();
  });
  it("separates test/live targets and requires explicit live setup", () => {
    expect(sheetsConfig(input)?.mode).toBe("test");
    for (const invalid of [
      { ...input, DATABASE_URL: "postgresql://prod@remote/db" },
      { ...input, SHEETS_SPREADSHEET_ID: "other-spreadsheet-123456789" },
      { ...input, SHEETS_SYNC_MODE: "live" },
      { ...input, SHEETS_SYNC_MODE: "live", SHEETS_LIVE_CONFIRMED: "true" },
      { ...input, GOOGLE_SERVICE_ACCOUNT_JSON: "private" },
    ])
      expect(() => sheetsConfig(invalid)).toThrow();
    expect(
      sheetsConfig({
        ...input,
        SHEETS_SYNC_MODE: "live",
        SHEETS_LIVE_CONFIRMED: "true",
        SHEETS_SPREADSHEET_ID: LIVE_SPREADSHEET_ID,
        DATABASE_URL: "postgresql://unused@production-db.internal/railway",
      })?.mode,
    ).toBe("live");
  });
  it("rejects swapped destinations and local databases even with live confirmation", () => {
    const live = {
      ...input,
      SHEETS_SYNC_MODE: "live",
      SHEETS_LIVE_CONFIRMED: "true",
      SHEETS_SPREADSHEET_ID: LIVE_SPREADSHEET_ID,
      DATABASE_URL: "postgresql://unused@production-db.internal/railway",
    };
    for (const invalid of [
      { ...input, SHEETS_SPREADSHEET_ID: LIVE_SPREADSHEET_ID },
      { ...live, SHEETS_SPREADSHEET_ID: TEST_SPREADSHEET_ID },
      { ...live, SHEETS_SPREADSHEET_ID: "unapproved-spreadsheet-123456789" },
      { ...live, SHEETS_LIVE_CONFIRMED: "false" },
      ...[
        "127.0.0.1",
        "127.0.0.2",
        "localhost",
        "test.localhost",
        "0.0.0.0",
        "[::1]",
        "[::]",
        "LOCALHOST",
        "localhost.",
        "host.docker.internal",
        "localhost.localdomain",
      ].map((host) => ({
        ...live,
        DATABASE_URL: `postgresql://unused@${host}/railway`,
      })),
      ...["lisi_dev", "lisi_test"].map((name) => ({
        ...live,
        DATABASE_URL: `postgresql://unused@production-db.internal/${name}`,
      })),
      { ...live, DATABASE_URL: "not-a-url" },
      { ...live, DATABASE_URL: "postgresql:///railway" },
      {
        ...live,
        DATABASE_URL:
          "postgresql://unused@production-db.internal/railway?host=127.0.0.1",
      },
      {
        ...live,
        DATABASE_URL: "postgresql://unused@%2Fvar%2Frun%2Fpostgresql/railway",
      },
      {
        ...live,
        DATABASE_URL: "postgresql://unused@production-db.internal/lisi%5Fdev",
      },
      { ...live, DATABASE_URL: "https://production-db.internal/railway" },
    ])
      expect(() => sheetsConfig(invalid)).toThrow(SheetsError);
    expect(LIVE_SPREADSHEET_ID).not.toBe(TEST_SPREADSHEET_ID);
  });
  it("uses numeric Jakarta dates, blank open clock-out, and stable shift identity", () => {
    expect(sheetDate(new Date("2026-10-19T17:00:00Z")) % 1).toBeCloseTo(0);
    const shift = {
      id: "shift",
      employee_id: "person",
      name: '=IMPORTXML("bad")',
      clock_in: new Date("2026-10-19T01:00:00Z"),
      clock_out: null,
    };
    const open = attendanceRow(shift, 1),
      closed = attendanceRow(
        { ...shift, clock_out: new Date("2026-10-19T09:00:00Z") },
        1,
      );
    expect(open.values.slice(4)).toEqual(["", "", "working"]);
    expect(closed.sourceId).toBe(open.sourceId);
    expect(closed.values[5]).toBe(8);
  });
  it("bounds retry delays and never exposes error payloads", () => {
    expect(retryDelay(0)).toBe(5);
    expect(retryDelay(999)).toBe(3600);
    expect(sheetsErrorCode(new Error("secret"))).toBe("unavailable");
    expect(sheetsErrorCode(new SheetsError("google_403"))).toBe("google_403");
  });
});
describe("Google API adapter", () => {
  function transport(
    keys: Record<Tab, string[][]> = {
      Sales: [],
      Attendance: [],
    },
    options: { legacy?: boolean; salesHeader?: string[] } = {},
  ) {
    const request = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.includes("values:batchGet"))
        return Response.json({
          valueRanges: [
            ...tabs.flatMap((tab) => [
              {
                values: [
                  tab === "Sales"
                    ? (options.salesHeader ?? headers[tab])
                    : headers[tab],
                ],
              },
              { values: keys[tab] },
            ]),
            ...(options.legacy
              ? [{ values: [legacyItemHeaders] }, { values: [["line"]] }]
              : []),
          ],
        });
      if (path.endsWith("?fields=sheets.properties"))
        return Response.json({
          sheets: [
            ...tabs.map((title, i) => ({
              properties: {
                title,
                sheetId: 81001 + i,
                gridProperties: { rowCount: 1000, columnCount: 10 },
              },
            })),
            ...(options.legacy
              ? [
                  {
                    properties: {
                      title: "Sale items",
                      sheetId: 81002,
                      gridProperties: { rowCount: 1000, columnCount: 8 },
                    },
                  },
                ]
              : []),
          ],
        });
      return Response.json({});
    });
    return {
      api: new GoogleSheets(
        config,
        async () => new Headers({ Authorization: "Bearer fake" }),
        undefined,
        request,
      ),
      request,
    };
  }
  it("writes exact reserved ranges with RAW strings and numeric money", async () => {
    const { api, request } = transport();
    await api.write([
      {
        tab: "Sales",
        sourceId: "id",
        jobId: 1,
        rowNumber: 7,
        values: ["id", "=1+1", 20000],
      },
    ]);
    const options = request.mock.calls[0][1]!;
    expect(JSON.parse(options.body as string)).toEqual({
      valueInputOption: "RAW",
      data: [{ range: "'Sales'!A7:J7", values: [["id", "=1+1", 20000]] }],
    });
    expect(options.redirect).toBe("error");
  });
  it("refuses moved/foreign/duplicate rows instead of overwriting data", async () => {
    for (const keys of [[["different"]], [["id"], ["id"]]]) {
      const { api, request } = transport({
        Sales: keys,
        Attendance: [],
      });
      await expect(
        api.prepare([{ tab: "Sales", sourceId: "id", rowNumber: 2 }]),
      ).rejects.toThrow("layout_conflict");
      expect(request.mock.calls.some(([, o]) => o?.method === "POST")).toBe(
        false,
      );
    }
  });
  it("accepts stable mapped IDs and never clears unrelated tabs", async () => {
    const { api, request } = transport({
      Sales: [["id"]],
      Attendance: [],
    });
    await api.prepare([{ tab: "Sales", sourceId: "id", rowNumber: 2 }]);
    expect(request.mock.calls.length).toBe(4);
    expect(
      request.mock.calls.every(([url]) => !String(url).includes("clear")),
    ).toBe(true);
  });
  it("sanitizes Google failures and rejects oversized batches", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "PRIVATE" }, { status: 403 }),
    );
    const api = new GoogleSheets(
      config,
      async () => new Headers(),
      undefined,
      request,
    );
    await expect(api.write([])).rejects.toThrow("google_403");
    await expect(
      api.write([
        {
          tab: "Sales",
          sourceId: "id",
          jobId: 1,
          rowNumber: 2,
          values: ["x".repeat(1600000)],
        },
      ]),
    ).rejects.toThrow("batch_too_large");
  });
  it("upgrades only the known Sales header and archives legacy details after a successful write", async () => {
    const { api, request } = transport(
      { Sales: [["sale"]], Attendance: [] },
      { legacy: true, salesHeader: headers.Sales.slice(0, 9) },
    );
    await api.prepare([
      { tab: "Sales", sourceId: "sale", rowNumber: 2 },
      { tab: "Sale items", sourceId: "line", rowNumber: 2 },
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toContain('"hidden":true');
    await api.write([
      {
        tab: "Sales",
        sourceId: "sale",
        jobId: 1,
        rowNumber: 2,
        values: ["sale"],
      },
    ]);
    const bodies = request.mock.calls
      .filter(([, o]) => o?.body)
      .map(([, o]) => JSON.parse(o!.body as string));
    expect(bodies.at(-1)).toEqual({
      requests: [
        {
          updateDimensionProperties: {
            range: {
              sheetId: 81001,
              dimension: "ROWS",
              startIndex: 1,
              endIndex: 2,
            },
            properties: { pixelSize: 32 },
            fields: "pixelSize",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: 81002, hidden: true },
            fields: "hidden",
          },
        },
      ],
    });
    expect(JSON.stringify(bodies)).not.toMatch(
      /deleteSheet|deleteDimension|clear/,
    );
    expect(
      bodies.some((b) =>
        b.data?.some(
          (d: { values: string[][] }) =>
            d.values[0][9] === "Rincian item (IDR)",
        ),
      ),
    ).toBe(true);
  });
  it("rejects customized Sales headers and leaves unrelated legacy-named tabs visible", async () => {
    const bad = transport(undefined, {
      salesHeader: [...headers.Sales.slice(0, 9), "Owner notes"],
    });
    await expect(bad.api.prepare([])).rejects.toThrow("layout_conflict");
    const { api, request } = transport(undefined, { legacy: true });
    await api.prepare([]);
    await api.write([
      {
        tab: "Sales",
        sourceId: "sale",
        jobId: 1,
        rowNumber: 2,
        values: ["sale"],
      },
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toContain('"hidden":true');
  });
});
