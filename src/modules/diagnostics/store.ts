import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { DiagnosticEvent } from "./types";

/** Group the same symptom/code/location/release; raw messages never influence grouping. */
export function diagnosticFingerprint(event: DiagnosticEvent) {
  return createHash("sha256").update(JSON.stringify([
    event.kind, event.source, event.path, event.method, event.release,
    event.httpStatus, event.errorKind, event.technicalCode, event.frames[0] ?? null,
  ])).digest("hex");
}

/** Write diagnostics in their own transaction, never inside a business transaction. */
export async function persistDiagnostics(pool: Pool, batch: DiagnosticEvent[]) {
  if (!batch.length) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='100ms'");
    // One short lock bounds cross-process cleanup and capacity checks.
    await client.query("SELECT pg_advisory_xact_lock(891121)");
    await client.query("DELETE FROM diagnostic_event WHERE id IN (SELECT id FROM diagnostic_event WHERE at<now()-interval '30 days' ORDER BY at LIMIT 1000)");
    await client.query("DELETE FROM diagnostic_issue WHERE id IN (SELECT id FROM diagnostic_issue WHERE last_seen_at<now()-interval '30 days' ORDER BY last_seen_at LIMIT 1000)");
    const counts = (await client.query("SELECT (SELECT count(*)::int FROM diagnostic_event) AS events,(SELECT count(*)::int FROM diagnostic_issue) AS issues")).rows[0];
    if (counts.events + batch.length > 100000)
      await client.query("DELETE FROM diagnostic_event WHERE id IN (SELECT id FROM diagnostic_event ORDER BY at,id LIMIT $1)", [Math.min(1000, counts.events + batch.length - 100000)]);
    if (counts.issues + batch.length > 10000)
      await client.query("DELETE FROM diagnostic_issue WHERE id IN (SELECT id FROM diagnostic_issue ORDER BY last_seen_at,id LIMIT $1)", [Math.min(1000, counts.issues + batch.length - 10000)]);
    for (const event of batch.slice(0, 10)) {
      const fingerprint = diagnosticFingerprint(event);
      const result = await client.query(
        `INSERT INTO diagnostic_issue(id,fingerprint,kind,source,severity,path,method,release,http_status,error_kind,technical_code,first_seen_at,last_seen_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
         ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint RETURNING id`,
        [randomUUID(),fingerprint,event.kind,event.source,event.severity,event.path,event.method,event.release,event.httpStatus,event.errorKind,event.technicalCode,event.at],
      );
      const issueId = result.rows[0].id;
      const inserted = await client.query("INSERT INTO diagnostic_event(id,issue_id,at,frames) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id", [event.id, issueId, event.at, JSON.stringify(event.frames)]);
      if (inserted.rowCount)
        await client.query("UPDATE diagnostic_issue SET last_seen_at=GREATEST(last_seen_at,$2),first_seen_at=LEAST(first_seen_at,$2),occurrences=LEAST(occurrences+1,1000000000),revision=LEAST(revision+1,1000000000),state='open',resolved_at=NULL WHERE id=$1", [issueId,event.at]);
    }
    await client.query("DELETE FROM diagnostic_issue WHERE occurrences=0");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Hourly bounded housekeeping removes old samples and inactive groups, not business data. */
export async function pruneDiagnostics(pool: Pool) {
  for (let i = 0; i < 100; i++) {
    const events = await pool.query("DELETE FROM diagnostic_event WHERE id IN (SELECT id FROM diagnostic_event WHERE at<now()-interval '30 days' ORDER BY at LIMIT 1000)");
    const issues = await pool.query("DELETE FROM diagnostic_issue WHERE id IN (SELECT id FROM diagnostic_issue WHERE last_seen_at<now()-interval '30 days' ORDER BY last_seen_at LIMIT 1000) AND last_seen_at<now()-interval '30 days'");
    if ((events.rowCount ?? 0) < 1000 && (issues.rowCount ?? 0) < 1000) break;
  }
}
