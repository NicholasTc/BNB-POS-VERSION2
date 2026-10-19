import { describe, it, expect, vi } from "vitest";
import {
  sheetsConfig,
  TEST_SPREADSHEET_ID,
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
        SHEETS_SPREADSHEET_ID: "production-spreadsheet-123456789",
      })?.mode,
    ).toBe("live");
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
      "Sale items": [],
      Attendance: [],
    },
  ) {
    const request = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.includes("values:batchGet"))
        return Response.json({
          valueRanges: tabs.flatMap((tab) => [
            { values: [headers[tab]] },
            { values: keys[tab] },
          ]),
        });
      if (path.endsWith("?fields=sheets.properties"))
        return Response.json({
          sheets: tabs.map((title, i) => ({
            properties: {
              title,
              sheetId: 81001 + i,
              gridProperties: { rowCount: 1000, columnCount: 10 },
            },
          })),
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
      data: [{ range: "'Sales'!A7:I7", values: [["id", "=1+1", 20000]] }],
    });
    expect(options.redirect).toBe("error");
  });
  it("refuses moved/foreign/duplicate rows instead of overwriting data", async () => {
    for (const keys of [[["different"]], [["id"], ["id"]]]) {
      const { api, request } = transport({
        Sales: keys,
        "Sale items": [],
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
      "Sale items": [],
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
});
