export const diagnosticKinds = [
  "request_failed", "database_connection", "server_render", "browser_crash",
  "browser_request", "cashier_load", "sheets_sync", "daily_report",
] as const;
export type DiagnosticKind = (typeof diagnosticKinds)[number];
export type DiagnosticSource = "server" | "browser" | "worker";
export type DiagnosticInput = {
  kind: DiagnosticKind;
  source: DiagnosticSource;
  path?: string;
  method?: string;
  status?: number;
  error?: unknown;
  technicalCode?: string;
  frames?: string[];
  release?: string;
};
export type DiagnosticEvent = {
  schemaVersion: 1;
  id: string;
  at: string;
  kind: DiagnosticKind;
  source: DiagnosticSource;
  severity: "error" | "warning";
  path: string;
  method: string;
  release: string;
  httpStatus: number | null;
  errorKind: string;
  technicalCode: string | null;
  frames: string[];
};
export type DiagnosticIssue = Omit<DiagnosticEvent, "schemaVersion" | "at"> & {
  state: "open" | "resolved";
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  revision: number;
  resolvedAt: string | null;
};
export type DiagnosticFeed = {
  items: DiagnosticIssue[];
  page: number;
  hasMore: boolean;
  captureEnabled: boolean;
  retentionDays: number;
};
export type DiagnosticDetail = {
  issue: DiagnosticIssue;
  events: { id: string; at: string; frames: string[] }[];
  sampleLimit: number;
};
