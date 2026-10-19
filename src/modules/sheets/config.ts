// Server-only configuration; deliberately independent of core POS validation.
export const TEST_SPREADSHEET_ID =
  "1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc";
export type SheetsConfig = {
  mode: "test" | "live";
  spreadsheetId: string;
  credentialFile?: string;
  credentialJson?: string;
};
export class SheetsError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "SheetsError";
  }
}
export function sheetsConfig(
  input: Record<string, string | undefined> = process.env,
): SheetsConfig | null {
  const mode = input.SHEETS_SYNC_MODE ?? "off";
  if (mode === "off") return null;
  if (mode !== "test" && mode !== "live")
    throw new SheetsError("configuration");
  const spreadsheetId = input.SHEETS_SPREADSHEET_ID ?? "";
  if (!/^[a-zA-Z0-9_-]{20,150}$/.test(spreadsheetId))
    throw new SheetsError("configuration");
  const database = new URL(input.DATABASE_URL ?? "");
  if (
    mode === "test" &&
    (!["127.0.0.1", "localhost"].includes(database.hostname) ||
      !["/lisi_dev", "/lisi_test"].includes(database.pathname) ||
      spreadsheetId !== TEST_SPREADSHEET_ID)
  )
    throw new SheetsError("test_environment_required");
  if (
    mode === "live" &&
    (input.SHEETS_LIVE_CONFIRMED !== "true" ||
      spreadsheetId === TEST_SPREADSHEET_ID)
  )
    throw new SheetsError("live_setup_required");
  if (
    !!input.GOOGLE_SERVICE_ACCOUNT_FILE === !!input.GOOGLE_SERVICE_ACCOUNT_JSON
  )
    throw new SheetsError("credentials_configuration");
  return {
    mode,
    spreadsheetId,
    credentialFile: input.GOOGLE_SERVICE_ACCOUNT_FILE,
    credentialJson: input.GOOGLE_SERVICE_ACCOUNT_JSON,
  };
}
export function sheetsErrorCode(error: unknown): string {
  return error instanceof SheetsError ? error.code : "unavailable";
}
