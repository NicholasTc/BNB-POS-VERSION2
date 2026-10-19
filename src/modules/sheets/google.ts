import { readFile } from "node:fs/promises";
import { JWT } from "google-auth-library";
import { z } from "zod";
import { SheetsError, type SheetsConfig } from "./config";
import {
  tabs,
  headers,
  legacyItemHeaders,
  cellRange,
  type RowMapping,
  type MappedRow,
} from "./rows";

export interface SheetsTransport {
  prepare(mappings: RowMapping[]): Promise<void>;
  write(rows: MappedRow[]): Promise<void>;
}
export class GoogleSheets implements SheetsTransport {
  private base: string;
  private legacySheetId?: number;
  private salesSheetId = 81001;
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
  async prepare(mappings: RowMapping[]) {
    this.legacySheetId = undefined;
    const metadata = await this.call("?fields=sheets.properties");
    const props = (
      metadata.sheets as {
        properties: {
          sheetId: number;
          title: string;
          hidden?: boolean;
          gridProperties: { rowCount: number; columnCount: number };
        };
      }[]
    ).map((s) => s.properties);
    this.salesSheetId =
      props.find((p) => p.title === "Sales")?.sheetId ?? 81001;
    const structural: unknown[] = [];
    for (const tab of tabs) {
      const existing = props.find((p) => p.title === tab);
      const capacity = Math.max(
        1000,
        ...mappings
          .filter((r) => r.tab === tab)
          .map((r) => Math.ceil((r.rowNumber + 1) / 1000) * 1000),
      );
      const id = existing?.sheetId ?? (tab === "Sales" ? 81001 : 81003);
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
    const legacy = props.find((p) => p.title === "Sale items");
    if (legacy && !legacy.hidden)
      ranges.push("'Sale items'!A1:H1", "'Sale items'!A2:A");
    const query = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    ranges.forEach((range) => query.append("ranges", range));
    const current = await this.call(`/values:batchGet?${query}`);
    const values = current.valueRanges as { values?: (string | number)[][] }[];
    for (const [i, tab] of tabs.entries()) {
      const head = values[2 * i]?.values?.[0] ?? [];
      // Only the exact known nine-column Sales header can be upgraded in place.
      const oldSales =
        tab === "Sales" &&
        JSON.stringify(head) === JSON.stringify(headers.Sales.slice(0, 9));
      if (
        head.length &&
        !oldSales &&
        JSON.stringify(head) !== JSON.stringify(headers[tab])
      )
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
    if (legacy && !legacy.hidden) {
      const head = values[2 * tabs.length]?.values?.[0] ?? [];
      const expected = new Map(
        mappings
          .filter((m) => m.tab === "Sale items")
          .map((m) => [m.rowNumber, m.sourceId]),
      );
      const keys = values[2 * tabs.length + 1]?.values ?? [];
      // Never hide an unrelated same-named tab. Preserve all legacy cells/maps.
      if (
        expected.size &&
        JSON.stringify(head) === JSON.stringify(legacyItemHeaders) &&
        keys.every(
          (r, n) =>
            r[0] === undefined || r[0] === "" || r[0] === expected.get(n + 2),
        )
      )
        this.legacySheetId = legacy.sheetId;
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
    for (const tab of tabs) {
      const id =
        props.find((p) => p.title === tab)?.sheetId ??
        (tab === "Sales" ? 81001 : 81003);
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
      if (tab === "Sales")
        format.push(
          {
            updateDimensionProperties: {
              range: {
                sheetId: id,
                dimension: "COLUMNS",
                startIndex: 9,
                endIndex: 10,
              },
              properties: { pixelSize: 440 },
              fields: "pixelSize",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId: id,
                startRowIndex: 1,
                startColumnIndex: 9,
                endColumnIndex: 10,
              },
              cell: {
                userEnteredFormat: {
                  wrapStrategy: "WRAP",
                  verticalAlignment: "TOP",
                  textFormat: { fontSize: 10 },
                },
              },
              fields:
                "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontSize",
            },
          },
        );
      const dates = tab === "Sales" ? [2] : tab === "Attendance" ? [3, 4] : [];
      const numbers = tab === "Sales" ? [6, 7] : [5];
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
    const sales = rows.filter((r) => r.tab === "Sales");
    if (sales.length) {
      // Archive only after a successful combined-row write. Hiding is reversible.
      const requests: unknown[] = sales.map((row) => ({
        updateDimensionProperties: {
          range: {
            sheetId: this.salesSheetId,
            dimension: "ROWS",
            startIndex: row.rowNumber - 1,
            endIndex: row.rowNumber,
          },
          // Google auto-resize can leave API-written wrapped cells at 21px.
          // Allow a conservative 32 characters per line in the 440px/10pt cell,
          // plus padding. This also accommodates long product names without
          // changing or truncating the exported text.
          properties: {
            pixelSize: Math.max(
              32,
              12 +
                18 *
                  String(row.values[9] ?? "")
                    .split("\n")
                    .reduce(
                      (n, line) => n + Math.max(1, Math.ceil(line.length / 32)),
                      0,
                    ),
            ),
          },
          fields: "pixelSize",
        },
      }));
      if (this.legacySheetId !== undefined)
        requests.push({
          updateSheetProperties: {
            properties: { sheetId: this.legacySheetId, hidden: true },
            fields: "hidden",
          },
        });
      await this.call(":batchUpdate", {
        requests,
      });
    }
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
