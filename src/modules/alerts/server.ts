import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ownerAlertState, audit } from "@/db/schema";
import { AppError } from "@/lib/http";
import { sheetsConfig } from "@/modules/sheets/config";
import {
  detectAlerts,
  canManageAlert,
  type AlertFacts,
  type SyncSetting,
} from "./rules";
import {
  alertCommand,
  alertKeys,
  PAID_GRACE_MS,
  PENDING_GRACE_MS,
  SNOOZE_MS,
  type AlertCommand,
  type AlertFeed,
  type OwnerAlert,
} from "./types";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function syncSetting(): SyncSetting {
  try {
    const config = sheetsConfig();
    return config
      ? { mode: config.mode, spreadsheetId: config.spreadsheetId }
      : { mode: "off" };
  } catch {
    return { mode: "configuration" };
  }
}
async function facts(tx: Tx, now: Date): Promise<AlertFacts> {
  // Single MVCC statement. Only current menu, bounded supplies, unfinished sales
  // and the indexed pending export queue are inspected; no full sales history.
  const result = await tx.execute<{ facts: AlertFacts }>(sql`
    WITH supplies AS (
      SELECT i.*,m.id AS restock FROM stock_item i LEFT JOIN LATERAL
        (SELECT id FROM stock_movement WHERE stock_item_id=i.id AND kind<>'sale' ORDER BY created_at DESC,id DESC LIMIT 1) m ON true
      WHERE balance<=low_threshold
    ), overdue AS (
      SELECT id,status FROM sale WHERE
        (status='pending' AND created_at<=${new Date(now.getTime() - PENDING_GRACE_MS)}) OR
        (status='paid' AND attested_at<=${new Date(now.getTime() - PAID_GRACE_MS)})
    ), pending_jobs AS (SELECT last_error,updated_at FROM sheets_sync_job WHERE synced_revision<revision)
    SELECT jsonb_build_object(
      'categories',(SELECT jsonb_build_object('count',count(*)::int,'fingerprint',md5(coalesce(string_agg(id::text||':'||name,',' ORDER BY id),''))) FROM menu_item WHERE active AND category='uncategorized'),
      'low',(SELECT jsonb_build_object('count',count(*)::int,'fingerprint',md5(coalesce(string_agg(id::text||':'||low_threshold::text||':'||coalesce(restock::text,''),',' ORDER BY id),''))) FROM supplies WHERE balance>=0),
      'negative',(SELECT jsonb_build_object('count',count(*)::int,'fingerprint',md5(coalesce(string_agg(id::text||':'||coalesce(restock::text,''),',' ORDER BY id),''))) FROM supplies WHERE balance<0),
      'pending',(SELECT jsonb_build_object('count',count(*)::int,'fingerprint',md5(coalesce(string_agg(id::text,',' ORDER BY id),''))) FROM overdue WHERE status='pending'),
      'paid',(SELECT jsonb_build_object('count',count(*)::int,'fingerprint',md5(coalesce(string_agg(id::text,',' ORDER BY id),''))) FROM overdue WHERE status='paid'),
      'sync',(SELECT jsonb_build_object('pending',count(*)::int,'failed',count(*) FILTER (WHERE last_error IS NOT NULL)::int,'oldest',min(updated_at)) FROM pending_jobs),
      'target',(SELECT jsonb_build_object('mode',mode,'spreadsheetId',spreadsheet_id,'attemptedAt',last_attempt_at,'successAt',last_success_at,'error',last_error) FROM sheets_sync_target WHERE id='primary')
    ) AS facts`);
  return result.rows[0].facts;
}
async function reconcile(
  tx: Tx,
  ownerId: string,
  now: Date,
): Promise<AlertFeed> {
  const candidates = detectAlerts(await facts(tx, now), syncSetting(), now);
  const states = await tx
    .select()
    .from(ownerAlertState)
    .where(eq(ownerAlertState.ownerId, ownerId));
  const byKey = new Map(states.map((s) => [s.key, s]));
  const items: OwnerAlert[] = [];
  for (const candidate of candidates) {
    let state = byKey.get(candidate.key);
    const where = and(
      eq(ownerAlertState.ownerId, ownerId),
      eq(ownerAlertState.key, candidate.key),
    );
    if (!state) {
      [state] = await tx
        .insert(ownerAlertState)
        .values({
          ownerId,
          key: candidate.key,
          fingerprint: candidate.fingerprint,
          firstSeenAt: now,
        })
        .returning();
    } else if (!state.active || state.fingerprint !== candidate.fingerprint) {
      [state] = await tx
        .update(ownerAlertState)
        .set({
          active: true,
          fingerprint: candidate.fingerprint,
          version: state.version + 1,
          disposition: "none",
          snoozedUntil: null,
          firstSeenAt: now,
        })
        .where(where)
        .returning();
    } else if (
      state.disposition === "snoozed" &&
      state.snoozedUntil!.getTime() <= now.getTime()
    ) {
      [state] = await tx
        .update(ownerAlertState)
        .set({
          disposition: "none",
          snoozedUntil: null,
          version: state.version + 1,
        })
        .where(where)
        .returning();
    }
    items.push({
      key: candidate.key,
      count: candidate.count,
      reason: candidate.reason,
      severity: candidate.severity,
      destination: candidate.destination,
      version: state.version,
      disposition: state.disposition as OwnerAlert["disposition"],
      firstSeenAt: state.firstSeenAt.toISOString(),
      snoozedUntil: state.snoozedUntil?.toISOString() ?? null,
      hidden:
        state.disposition === "dismissed" || state.disposition === "snoozed",
    });
  }
  for (const state of states)
    if (state.active && !candidates.some((c) => c.key === state.key))
      await tx
        .update(ownerAlertState)
        .set({
          active: false,
          version: state.version + 1,
          disposition: "none",
          snoozedUntil: null,
        })
        .where(
          and(
            eq(ownerAlertState.ownerId, ownerId),
            eq(ownerAlertState.key, state.key),
          ),
        );
  return {
    items,
    visibleCount: items.filter((a) => !a.hidden).length,
    urgentCount: items.filter((a) => a.severity === "urgent").length,
    observedAt: now.toISOString(),
  };
}
export async function ownerAlerts(
  ownerId: string,
  raw?: AlertCommand,
): Promise<AlertFeed> {
  // Six current episodes per owner, bounded forever. This lock never acquires
  // any device, sale or stock lock. GET only updates this module's metadata.
  const input = raw === undefined ? undefined : alertCommand.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(891108)`);
    const now = new Date();
    const feed = await reconcile(tx, ownerId, now);
    if (!input) return feed;
    for (const target of input.targets) {
      const alert = feed.items.find((a) => a.key === target.key);
      if (!alert || alert.version !== target.version)
        throw new AppError(
          409,
          "Peringatan berubah. Perbarui daftar lalu coba lagi.",
        );
      if (!canManageAlert(input.action, alert))
        throw new AppError(400, "Tindakan peringatan tidak diizinkan.");
    }
    for (const target of input.targets) {
      await tx
        .update(ownerAlertState)
        .set({
          version: target.version + 1,
          disposition:
            input.action === "snooze"
              ? "snoozed"
              : input.action === "acknowledge"
                ? "acknowledged"
                : input.action === "restore"
                  ? "none"
                  : "dismissed",
          snoozedUntil:
            input.action === "snooze"
              ? new Date(now.getTime() + SNOOZE_MS)
              : null,
        })
        .where(
          and(
            eq(ownerAlertState.ownerId, ownerId),
            eq(ownerAlertState.key, target.key),
          ),
        );
    }
    await tx.insert(audit).values({
      actor: ownerId,
      action: `alerts.${input.action}`,
      details: {
        keys: input.targets
          .map((t) => t.key)
          .filter((k) => alertKeys.includes(k)),
      },
    });
    return reconcile(tx, ownerId, now);
  });
}
