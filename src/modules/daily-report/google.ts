import type { GoogleSheets } from "@/modules/sheets/google";
import { serial } from "./dates";
import {
  DailyReportError,
  REPORT_TAB,
  REPORT_MARKER,
  REPORT_HEADERS,
  MAX_REPORT_ROWS,
  type DailyTransport,
  type ReportPrepare,
  type ReportWrite,
} from "./types";

type Property = {
  sheetId: number;
  title: string;
  gridProperties: { rowCount: number; columnCount: number };
};
type Value = string | number;
const cell = (value: Value) => ({
  userEnteredValue:
    typeof value === "number" ? { numberValue: value } : { stringValue: value },
});
export function reportFormula(capacity: number) {
  const selected = `SORT(FILTER($I$6:$N$${capacity},$H$6:$H$${capacity}=$B$2,$I$6:$I$${capacity}<>""),1,TRUE,4,TRUE)`;
  return `=IFNA(VSTACK(${selected},HSTACK("","","","",SUMIF($H$6:$H$${capacity},$B$2,$M$6:$M$${capacity}),"")),HSTACK("Belum ada laporan untuk tanggal ini.","","","","",""))`;
}
export function statusFormula(capacity: number) {
  return `=IFNA("Diperbarui "&TEXT(VLOOKUP($B$2,$P$6:$R$${capacity},2,FALSE),"dd mmm yyyy hh:mm")&" WIB. "&VLOOKUP($B$2,$P$6:$R$${capacity},3,FALSE),"Pilih tanggal. Laporan belum tersedia atau sedang disiapkan.")`;
}
export class GoogleDailyReport implements DailyTransport {
  private id?: number;
  private capacity = 1000;
  constructor(private api: Pick<GoogleSheets, "call">) {}
  private update(row: number, column: number, values: Value[][]) {
    return {
      updateCells: {
        start: { sheetId: this.id, rowIndex: row - 1, columnIndex: column },
        rows: values.map((r) => ({ values: r.map(cell) })),
        fields: "userEnteredValue",
      },
    };
  }
  private formula(row: number, formula: string) {
    return {
      updateCells: {
        start: { sheetId: this.id, rowIndex: row - 1, columnIndex: 0 },
        rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
        fields: "userEnteredValue",
      },
    };
  }
  private async values(range: string, render = "FORMULA") {
    return (
      ((
        await this.api.call(
          `/values/${encodeURIComponent("'" + REPORT_TAB + "'!" + range)}?valueRenderOption=${render}`,
        )
      ).values as Value[][] | undefined) ?? []
    );
  }
  async prepare(input: ReportPrepare) {
    const meta = await this.api.call("?fields=sheets.properties");
    const sheets = (meta.sheets as { properties: Property }[]).map(
      (s) => s.properties,
    );
    const existing = sheets.find((s) => s.title === REPORT_TAB);
    if (
      input.expectedSheetId !== null &&
      (!existing || existing.sheetId !== input.expectedSheetId)
    )
      throw new DailyReportError("report_layout_conflict");
    const minimum = Math.max(
      1000,
      input.days + 6,
      ...input.mappings.map((m) => m.rowNumber + 1),
    );
    if (minimum > MAX_REPORT_ROWS + 6)
      throw new DailyReportError("report_capacity");
    this.capacity = Math.max(
      existing?.gridProperties.rowCount ?? 0,
      Math.ceil(minimum / 1000) * 1000,
    );
    if (
      this.capacity > MAX_REPORT_ROWS + 1000 ||
      sheets.reduce(
        (n, s) => n + s.gridProperties.rowCount * s.gridProperties.columnCount,
        0,
      ) +
        (this.capacity * 18 -
          (existing
            ? existing.gridProperties.rowCount *
              existing.gridProperties.columnCount
            : 0)) >
        9000000
    )
      throw new DailyReportError("report_capacity");
    this.id =
      existing?.sheetId ??
      Array.from({ length: 100 }, (_, i) => 81004 + i).find(
        (id) => !sheets.some((s) => s.sheetId === id),
      );
    if (this.id === undefined)
      throw new DailyReportError("report_layout_conflict");
    const requests: unknown[] = [];
    const daySizes = new Map<string, number>();
    for (const mapping of input.mappings)
      if (mapping.active)
        daySizes.set(mapping.date, (daySizes.get(mapping.date) ?? 0) + 1);
    const tableEnd = Math.max(6, 5 + Math.max(0, ...daySizes.values()));
    if (existing) {
      const top = await this.values("A1:R5");
      if (
        top[0]?.[7] !== REPORT_MARKER ||
        JSON.stringify(top[3]?.slice(0, 6)) !==
          JSON.stringify(REPORT_HEADERS) ||
        top[4]?.[0] !== reportFormula(existing.gridProperties.rowCount) ||
        top[2]?.[0] !== statusFormula(existing.gridProperties.rowCount)
      )
        throw new DailyReportError("report_layout_conflict");
      // Validate stable reservations. A moved/sorted/deleted helper row must not
      // silently overwrite a different day; missing values are safe to repair.
      const keys = await this.values(`O6:O${existing.gridProperties.rowCount}`);
      const expected = new Map(input.mappings.map((m) => [m.rowNumber, m.key]));
      for (let i = 0; i < keys.length; i++)
        if (keys[i]?.[0] && expected.get(i + 6) !== keys[i][0])
          throw new DailyReportError("report_layout_conflict");
      if (existing.gridProperties.columnCount !== 18)
        throw new DailyReportError("report_layout_conflict");
      if (existing.gridProperties.rowCount < this.capacity)
        requests.push(
          {
            updateSheetProperties: {
              properties: {
                sheetId: this.id,
                gridProperties: { rowCount: this.capacity },
              },
              fields: "gridProperties.rowCount",
            },
          },
          this.formula(5, reportFormula(this.capacity)),
          this.formula(3, statusFormula(this.capacity)),
        );
    } else {
      requests.push(
        {
          addSheet: {
            properties: {
              sheetId: this.id,
              title: REPORT_TAB,
              gridProperties: {
                rowCount: this.capacity,
                columnCount: 18,
                frozenRowCount: 4,
              },
            },
          },
        },
        this.update(1, 0, [["LAPORAN PENJUALAN HARIAN"]]),
        this.update(1, 7, [[REPORT_MARKER]]),
        this.update(2, 0, [["HARI / TANGGAL :"]]),
        {
          updateCells: {
            start: { sheetId: this.id, rowIndex: 1, columnIndex: 1 },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { formulaValue: "=$H$2" },
                    note: "Pilih tanggal di sini. Hapus pilihan dan masukkan =$H$2 untuk mengikuti hari ini (WIB).",
                  },
                ],
              },
            ],
            fields: "userEnteredValue,note",
          },
        },
        this.update(4, 0, [[...REPORT_HEADERS]]),
        this.formula(5, reportFormula(this.capacity)),
        this.formula(3, statusFormula(this.capacity)),
        this.update(5, 7, [
          [
            "Tanggal",
            "Menu",
            "Jumlah",
            "Total (kosong)",
            "Harga",
            "Omset bersih",
            "Promo",
            "Kunci",
            "Tanggal laporan",
            "Diperbarui WIB",
            "Catatan",
          ],
        ]),
        ...[
          [0, 0, 1, 6],
          [1, 1, 2, 3],
          [2, 0, 3, 6],
        ].map(([sr, sc, er, ec]) => ({
          mergeCells: {
            range: {
              sheetId: this.id,
              startRowIndex: sr,
              startColumnIndex: sc,
              endRowIndex: er,
              endColumnIndex: ec,
            },
            mergeType: "MERGE_ALL",
          },
        })),
        ...this.format(),
      );
    }
    const border = {
      style: "SOLID",
      color: { red: 0.15, green: 0.15, blue: 0.15 },
    };
    requests.push(
      ...[
        [
          1,
          3,
          {
            horizontalAlignment: "CENTER",
            numberFormat: { type: "NUMBER", pattern: '0;-0;""' },
          },
        ],
        [
          3,
          5,
          {
            horizontalAlignment: "RIGHT",
            numberFormat: {
              type: "NUMBER",
              pattern: '"Rp "#,##0;"Rp "-#,##0;"Rp -"',
            },
          },
        ],
        [5, 6, { wrapStrategy: "WRAP", textFormat: { fontSize: 10 } }],
      ].map(([start, end, format]) => ({
        repeatCell: {
          range: {
            sheetId: this.id,
            startRowIndex: 4,
            endRowIndex: this.capacity,
            startColumnIndex: start,
            endColumnIndex: end,
          },
          cell: { userEnteredFormat: format },
          fields: "userEnteredFormat",
        },
      })),
      {
        updateBorders: {
          range: {
            sheetId: this.id,
            startRowIndex: 3,
            endRowIndex: tableEnd,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          top: border,
          bottom: border,
          left: border,
          right: border,
          innerHorizontal: border,
          innerVertical: border,
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: this.id,
            dimension: "ROWS",
            startIndex: 0,
            endIndex: Math.max(25, tableEnd),
          },
          properties: { hiddenByUser: false },
          fields: "hiddenByUser",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: this.id,
            dimension: "ROWS",
            startIndex: Math.max(25, tableEnd),
            endIndex: this.capacity,
          },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      },
    );
    requests.push(
      this.update(2, 7, [[serial(input.today)], [serial(input.earliest)]]),
      {
        setDataValidation: {
          range: {
            sheetId: this.id,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 1,
            endColumnIndex: 2,
          },
          rule: {
            condition: {
              type: "DATE_BETWEEN",
              values: [
                { userEnteredValue: "=$H$3" },
                { userEnteredValue: "=$H$2" },
              ],
            },
            strict: true,
            showCustomUi: true,
            inputMessage: "Pilih tanggal laporan (WIB).",
          },
        },
      },
    );
    await this.api.call(":batchUpdate", { requests });
    return this.id;
  }
  private format(): unknown[] {
    const range = (sr: number, er: number, sc = 0, ec = 6) => ({
      sheetId: this.id,
      startRowIndex: sr,
      endRowIndex: er,
      startColumnIndex: sc,
      endColumnIndex: ec,
    });
    const repeat = (r: unknown, format: unknown) => ({
      repeatCell: {
        range: r,
        cell: { userEnteredFormat: format },
        fields: "userEnteredFormat",
      },
    });
    return [
      repeat(range(0, this.capacity), {
        textFormat: { fontFamily: "Arial", fontSize: 11 },
        verticalAlignment: "MIDDLE",
      }),
      repeat(range(0, 1), { textFormat: { bold: true, fontSize: 16 } }),
      repeat(range(1, 2, 1, 3), {
        backgroundColor: { red: 0.9, green: 0.95, blue: 0.91 },
        textFormat: { bold: true },
        numberFormat: { type: "DATE", pattern: "dddd, dd mmmm yyyy" },
      }),
      repeat(range(2, 3), {
        textFormat: {
          fontSize: 9,
          foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 },
        },
        wrapStrategy: "WRAP",
      }),
      repeat(range(3, 4), {
        textFormat: { bold: true },
        horizontalAlignment: "CENTER",
        wrapStrategy: "WRAP",
      }),
      repeat(range(4, this.capacity, 1, 3), {
        horizontalAlignment: "CENTER",
        numberFormat: { type: "NUMBER", pattern: '0;-0;""' },
      }),
      repeat(range(4, this.capacity, 3, 5), {
        horizontalAlignment: "RIGHT",
        numberFormat: {
          type: "NUMBER",
          pattern: '"Rp "#,##0;"Rp "-#,##0;"Rp -"',
        },
      }),
      repeat(range(4, this.capacity, 5, 6), {
        wrapStrategy: "WRAP",
        textFormat: { fontSize: 10 },
      }),
      ...[330, 180, 120, 170, 180, 420].map((width, i) => ({
        updateDimensionProperties: {
          range: {
            sheetId: this.id,
            dimension: "COLUMNS",
            startIndex: i,
            endIndex: i + 1,
          },
          properties: { pixelSize: width },
          fields: "pixelSize",
        },
      })),
      {
        updateDimensionProperties: {
          range: {
            sheetId: this.id,
            dimension: "COLUMNS",
            startIndex: 7,
            endIndex: 18,
          },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: this.id,
            dimension: "ROWS",
            startIndex: 2,
            endIndex: 3,
          },
          properties: { pixelSize: 42 },
          fields: "pixelSize",
        },
      },
      {
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [
              {
                sheetId: this.id,
                startRowIndex: 4,
                startColumnIndex: 4,
                endColumnIndex: 5,
              },
            ],
            booleanRule: {
              condition: {
                type: "CUSTOM_FORMULA",
                values: [
                  {
                    userEnteredValue: '=AND($A5="",ISNUMBER($E5),$D5="")',
                  },
                ],
              },
              format: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.95, blue: 0.91 },
              },
            },
          },
        },
      },
    ];
  }
  async write(input: ReportWrite) {
    if (this.id === undefined)
      throw new DailyReportError("report_not_prepared");
    const requests: unknown[] = input.rows.map((row) =>
      this.update(row.rowNumber, 7, [row.values]),
    );
    // Publication status and data are committed in the same atomic request.
    requests.push(
      this.update(input.statusRow, 15, [
        [
          serial(input.date),
          serial(
            new Date(Date.parse(input.publishedAt) + 7 * 3600000).toISOString(),
          ),
          input.note,
        ],
      ]),
    );
    if (Buffer.byteLength(JSON.stringify(requests)) > 1500000)
      throw new DailyReportError("report_batch_too_large");
    await this.api.call(":batchUpdate", { requests });
    const check = await this.api.call(
      `?ranges=${encodeURIComponent("'" + REPORT_TAB + "'!A3:F5")}&fields=sheets.data.rowData.values.effectiveValue.errorValue`,
    );
    if (JSON.stringify(check).includes('"errorValue"'))
      throw new DailyReportError("report_formula_error");
  }
}
