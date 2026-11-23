import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool } from "@/db";
import { auth, OWNER_IDLE_SECONDS, OWNER_SESSION_SECONDS } from "@/lib/auth";
import { AppError, limit } from "@/lib/http";
import { deviceToken } from "@/modules/attendance";
import { digest } from "@/lib/credentials";
import { diagnosticsEnabled, recordDiagnostic } from "./record";
import { diagnosticFrames } from "./safe";
import { diagnosticCopy, technicalHint } from "./copy";
import type { DiagnosticDetail, DiagnosticFeed, DiagnosticIssue } from "./types";

export const browserDiagnostic = z.object({
  id: z.uuid(),
  kind: z.enum(["browser_crash", "browser_request", "cashier_load"]),
  path: z.string().max(200),
  method: z.enum(["GET", "POST", "DELETE", "UNKNOWN"]).optional(),
  timeout: z.boolean().optional(),
  frames: z.array(z.string().max(250)).max(5).optional(),
  release: z.union([z.literal("local"), z.string().regex(/^[a-f0-9]{7,40}$/)]).optional(),
}).strict();
export const diagnosticQuery = z.object({
  state: z.enum(["open", "resolved", "all"]).default("open"),
  source: z.enum(["all", "server", "browser", "worker"]).default("all"),
  severity: z.enum(["all", "error", "warning"]).default("all"),
  days: z.coerce.number().int().min(1).max(30).default(7),
  page: z.coerce.number().int().min(1).max(400).default(1),
  reference: z.union([z.literal(""), z.uuid()]).default(""),
  id: z.uuid().optional(),
  download: z.enum(["yes"]).optional(),
}).strict();
export const diagnosticCommand = z.object({ action: z.literal("resolve"), id: z.uuid(), revision: z.number().int().nonnegative().max(1000000000) }).strict();

/** Authenticate reports without extending privileged sessions or locking the cashier row. */
export async function authorizeDiagnosticReporter(request: Request) {
  const identity = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  const now = Date.now();
  if (identity && now - identity.session.createdAt.getTime() < OWNER_SESSION_SECONDS * 1000 && now - identity.session.updatedAt.getTime() < OWNER_IDLE_SECONDS * 1000) {
    const found = await pool.query("SELECT role FROM owner_user WHERE id=$1 AND role IN ('owner','admin')", [identity.user.id]);
    if (found.rowCount) return `identity:${identity.user.id}`;
  }
  const token = deviceToken(request);
  const found = await pool.query("SELECT 1 FROM device WHERE id='shared' AND token_hash=$1 AND expires_at>now()", [digest(token)]);
  if (!found.rowCount) throw new AppError(401, "Perangkat belum terhubung.");
  return `device:${digest(token)}`;
}

/** Accept only bounded, authenticated, untrusted browser observations; no identity is recorded. */
export async function ingestBrowserDiagnostic(request: Request, input: z.infer<typeof browserDiagnostic>) {
  const reporter = await authorizeDiagnosticReporter(request);
  await limit("diagnostics:all", 120, 60);
  await limit("diagnostics:" + reporter, 12, 60);
  if (diagnosticsEnabled()) recordDiagnostic({ kind: input.kind, source: "browser", path: input.path, method: input.method, frames: input.frames, release: input.release, technicalCode: input.timeout ? "timeout" : undefined }, input.id);
}

/** Map SQL values to the fixed public diagnostic shape, not unrestricted SQL rows. */
function issueRow(row: Record<string, unknown>): DiagnosticIssue {
  return {
    id: String(row.id), kind: row.kind as DiagnosticIssue["kind"], source: row.source as DiagnosticIssue["source"],
    severity: row.severity as DiagnosticIssue["severity"], path: String(row.path), method: String(row.method), release: String(row.release),
    httpStatus: row.http_status as number | null, errorKind: String(row.error_kind), technicalCode: row.technical_code as string | null,
    frames: diagnosticFrames(row.frames), state: row.state as DiagnosticIssue["state"],
    firstSeenAt: new Date(row.first_seen_at as Date).toISOString(), lastSeenAt: new Date(row.last_seen_at as Date).toISOString(),
    occurrences: Number(row.occurrences), revision: Number(row.revision), resolvedAt: row.resolved_at ? new Date(row.resolved_at as Date).toISOString() : null,
  };
}

/** List up to 25 grouped issues using parameterized, indexed filters; never touch business rows. */
export async function listDiagnostics(input: z.infer<typeof diagnosticQuery>): Promise<DiagnosticFeed> {
  const result = await pool.query(
    `SELECT i.*,sample.frames FROM diagnostic_issue i
     LEFT JOIN LATERAL(SELECT frames FROM diagnostic_event e WHERE e.issue_id=i.id ORDER BY e.at DESC,e.id DESC LIMIT 1) sample ON true
     WHERE i.occurrences>0 AND i.last_seen_at>=now()-$1*interval '1 day'
     AND ($2='all' OR i.state=$2) AND ($3='all' OR i.source=$3) AND ($4='all' OR i.severity=$4)
     AND ($5='' OR i.id=NULLIF($5,'')::uuid OR EXISTS(SELECT 1 FROM diagnostic_event e WHERE e.issue_id=i.id AND e.id=NULLIF($5,'')::uuid AND e.at>=now()-interval '30 days'))
     ORDER BY i.last_seen_at DESC,i.id DESC LIMIT 26 OFFSET $6`,
    [input.days,input.state,input.source,input.severity,input.reference,(input.page-1)*25],
  );
  return { items: result.rows.slice(0,25).map(issueRow), hasMore: result.rows.length>25, page: input.page, captureEnabled: diagnosticsEnabled(), retentionDays: 30 };
}

/** Return one issue and the last twenty retained reference/time/location samples. */
export async function diagnosticDetail(id: string): Promise<DiagnosticDetail> {
  const result = await pool.query("SELECT * FROM diagnostic_issue WHERE id=$1 AND occurrences>0 AND last_seen_at>=now()-interval '30 days'", [id]);
  if (!result.rowCount) throw new AppError(404, "Log tidak ditemukan atau sudah kedaluwarsa.");
  const events = await pool.query("SELECT id,at,frames FROM diagnostic_event WHERE issue_id=$1 AND at>=now()-interval '30 days' ORDER BY at DESC,id DESC LIMIT 20", [id]);
  const issue = issueRow({ ...result.rows[0], frames: events.rows[0]?.frames });
  return { issue, events: events.rows.map(row => ({ id: row.id, at: row.at.toISOString(), frames: diagnosticFrames(row.frames) })), sampleLimit: 20 };
}

/** Resolve only the revision the administrator inspected; new occurrences reopen it automatically. */
export async function resolveDiagnostic(input: z.infer<typeof diagnosticCommand>) {
  const result = await pool.query("UPDATE diagnostic_issue SET state='resolved',resolved_at=COALESCE(resolved_at,now()) WHERE id=$1 AND revision=$2 AND last_seen_at>=now()-interval '30 days' RETURNING id", [input.id,input.revision]);
  if (!result.rowCount) throw new AppError(409, "Ada kejadian baru atau log telah kedaluwarsa. Muat ulang sebelum menandai selesai.");
  return { ok: true };
}

/** Export an explicit, sanitized single-issue report with plain-language guidance. */
export function diagnosticReport(detail: DiagnosticDetail) {
  return { reportId: randomUUID(), exportedAt: new Date().toISOString(), ...detail, explanation: diagnosticCopy[detail.issue.kind], technicalHint: technicalHint(detail.issue.technicalCode), limits: "Browser reports are untrusted. Samples are bounded to 20 and retained for 30 days. Counts describe this grouped issue, not proof of lost business data. Logging is best effort; consult Railway logs during outages." };
}
