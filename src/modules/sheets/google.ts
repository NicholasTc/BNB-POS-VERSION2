import { readFile } from "node:fs/promises";
import { JWT } from "google-auth-library";
import { z } from "zod";
import { SheetsError, type SheetsConfig } from "./config";
import { tabs, headers, cellRange, type Tab, type MappedRow } from "./rows";

export interface SheetsTransport {
  prepare(
    mappings: { tab: Tab; sourceId: string; rowNumber: number }[],
  ): Promise<void>;
  write(rows: MappedRow[]): Promise<void>;
}
export class GoogleSheets implements SheetsTransport {
  private base: string;
  constructor(
    config: SheetsConfig,
    private authorization: () => Promise<Headers>,
    private signal?: AbortSignal,
    private request: typeof fetch = fetch,
  ) {
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  }
  async call(
    path: string,
    payload?: unknown,
  ): Promise<Record<string, unknown>> {
    const auth = await this.authorization();
    auth.set("Content-Type", "application/json");
    const response = await this.request(this.base + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: auth,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: "error",
      signal: this.signal
        ? AbortSignal.any([this.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new SheetsError(
        [401, 403, 404, 429].includes(response.status)
          ? `google_${response.status}`
          : "google_unavailable",
      );
    return await response.json();
  }
  async prepare(mappings: { tab: Tab; sourceId: string; rowNumber: number }[]) {
    const metadata = await this.call("?fields=sheets.properties");
    const props = (
      metadata.sheets as {
        properties: {
          sheetId: number;
          title: string;
          gridProperties: { rowCount: number; columnCount: number };
        };
      }[]
    ).map((s) => s.properties);
    const structural: unknown[] = [];
    for (const [i, tab] of tabs.entries()) {
      const existing = props.find((p) => p.title === tab);
      const capacity = Math.max(
        1000,
        ...mappings
          .filter((r) => r.tab === tab)
          .map((r) => Math.ceil((r.rowNumber + 1) / 1000) * 1000),
      );
      const id = existing?.sheetId ?? 81001 + i;
      if (!existing) {
        structural.push({
          addSheet: {
            properties: {
              sheetId: id,
              title: tab,
              gridProperties: {
                rowCount: capacity,
                columnCount: headers[tab].length,
                frozenRowCount: 1,
              },
            },
          },
        });
      } else if (
        existing.gridProperties.rowCount < capacity ||
        existing.gridProperties.columnCount < headers[tab].length
      ) {
        structural.push({
          updateSheetProperties: {
            properties: {
              sheetId: id,
              gridProperties: {
                rowCount: Math.max(capacity, existing.gridProperties.rowCount),
                columnCount: Math.max(
                  headers[tab].length,
                  existing.gridProperties.columnCount,
                ),
              },
            },
            fields: "gridProperties.rowCount,gridProperties.columnCount",
          },
        });
      }
    }
    if (structural.length)
      await this.call(":batchUpdate", { requests: structural });
    const ranges = tabs.flatMap((tab) => [cellRange(tab, 1), `'${tab}'!A2:A`]);
    const query = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    ranges.forEach((range) => query.append("ranges", range));
    const current = await this.call(`/values:batchGet?${query}`);
    const values = current.valueRanges as { values?: (string | number)[][] }[];
    for (const [i, tab] of tabs.entries()) {
      const head = values[2 * i]?.values?.[0] ?? [];
      if (head.length && JSON.stringify(head) !== JSON.stringify(headers[tab]))
        throw new SheetsError("layout_conflict");
      const expected = new Map(
        mappings
          .filter((m) => m.tab === tab)
          .map((m) => [m.rowNumber, m.sourceId]),
      );
      for (const [n, row] of (values[2 * i + 1]?.values ?? []).entries()) {
        if (
          row[0] !== undefined &&
          row[0] !== "" &&
          row[0] !== expected.get(n + 2)
        )
          throw new SheetsError("layout_conflict");
      }
    }
    // Idempotent header writes and formatting are safe after an ambiguous reply.
    await this.call("/values:batchUpdate", {
      valueInputOption: "RAW",
      data: tabs.map((tab) => ({
        range: cellRange(tab, 1),
        values: [headers[tab]],
      })),
    });
    const format: unknown[] = [];
    for (const [i, tab] of tabs.entries()) {
      const id = props.find((p) => p.title === tab)?.sheetId ?? 81001 + i;
      format.push(
        {
          repeatCell: {
            range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.098, green: 0.337, blue: 0.22 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
                wrapStrategy: "WRAP",
              },
            },
            fields: "userEnteredFormat",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: id,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: headers[tab].length,
            },
            properties: { pixelSize: 180 },
            fields: "pixelSize",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
      );
      const dates = tab === "Sales" ? [2] : tab === "Attendance" ? [3, 4] : [];
      const numbers =
        tab === "Sales" ? [6, 7] : tab === "Sale items" ? [5, 6, 7] : [5];
      for (const column of [...dates, ...numbers])
        format.push({
          repeatCell: {
            range: {
              sheetId: id,
              startRowIndex: 1,
              startColumnIndex: column,
              endColumnIndex: column + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: dates.includes(column) ? "DATE_TIME" : "NUMBER",
                  pattern: dates.includes(column)
                    ? "yyyy-mm-dd hh:mm:ss"
                    : tab === "Attendance"
                      ? "0.00"
                      : "#,##0",
                },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        });
    }
    await this.call(":batchUpdate", { requests: format });
  }
  async write(rows: MappedRow[]) {
    // RAW makes even malicious product/employee names literal text, not formulas.
    const data = rows.map((row) => ({
      range: cellRange(row.tab, row.rowNumber),
      values: [row.values],
    }));
    if (Buffer.byteLength(JSON.stringify(data)) > 1500000)
      throw new SheetsError("batch_too_large");
    await this.call("/values:batchUpdate", { valueInputOption: "RAW", data });
  }
}
export async function googleSheets(config: SheetsConfig, signal?: AbortSignal) {
  try {
    const raw =
      config.credentialJson ?? (await readFile(config.credentialFile!, "utf8"));
    const credential = z
      .object({
        type: z.literal("service_account"),
        client_email: z.email(),
        private_key: z.string().min(100),
        token_uri: z.literal("https://oauth2.googleapis.com/token"),
      })
      .parse(JSON.parse(raw));
    const auth = new JWT({
      email: credential.client_email,
      key: credential.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      transporterOptions: { timeout: 20000, retry: false },
    });
    return new GoogleSheets(config, () => auth.getRequestHeaders(), signal);
  } catch {
    throw new SheetsError("credentials_configuration");
  }
}
