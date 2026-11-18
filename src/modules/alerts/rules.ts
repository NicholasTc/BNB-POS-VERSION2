import type { AlertCandidate, AlertCommand, OwnerAlert } from "./types";
import { PAID_GRACE_MS } from "./types";
export type Group = { count: number; fingerprint: string };
export type AlertFacts = {
  categories: Group;
  low: Group;
  negative: Group;
  pending: Group;
  paid: Group;
  sync: { pending: number; failed: number; oldest: string | null };
  target: {
    mode: string;
    spreadsheetId: string;
    attemptedAt: string | null;
    successAt: string | null;
    error: string | null;
  } | null;
};
export type SyncSetting =
  | { mode: "off" | "configuration" }
  | { mode: "test" | "live"; spreadsheetId: string };
export function detectAlerts(
  f: AlertFacts,
  setting: SyncSetting,
  now: Date,
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const add = (candidate: AlertCandidate) => {
    if (candidate.count > 0) alerts.push(candidate);
  };
  add({
    key: "categories",
    fingerprint: f.categories.fingerprint,
    count: f.categories.count,
    severity: "info",
    reason: "categories",
    destination: "menu",
  });
  add({
    key: "stock-low",
    fingerprint: f.low.fingerprint,
    count: f.low.count,
    severity: "warning",
    reason: "stock-low",
    destination: "stock",
  });
  add({
    key: "stock-negative",
    fingerprint: f.negative.fingerprint,
    count: f.negative.count,
    severity: "urgent",
    reason: "stock-negative",
    destination: "stock",
  });
  add({
    key: "payment-pending",
    fingerprint: f.pending.fingerprint,
    count: f.pending.count,
    severity: "warning",
    reason: "payment-pending",
    destination: "transactions",
  });
  add({
    key: "payment-paid",
    fingerprint: f.paid.fingerprint,
    count: f.paid.count,
    severity: "urgent",
    reason: "payment-paid",
    destination: "transactions",
  });
  if (setting.mode !== "off") {
    const mismatch =
      setting.mode === "configuration" ||
      (f.target &&
        (f.target.mode !== setting.mode ||
          ("spreadsheetId" in setting &&
            setting.spreadsheetId !== f.target.spreadsheetId)));
    const stale =
      !f.target?.attemptedAt ||
      now.getTime() - new Date(f.target.attemptedAt).getTime() > PAID_GRACE_MS;
    const delayed =
      f.sync.oldest &&
      now.getTime() - new Date(f.sync.oldest).getTime() > PAID_GRACE_MS;
    const reason = mismatch
      ? "sheets-configuration"
      : f.target?.error || f.sync.failed
        ? "sheets-failed"
        : stale
          ? "sheets-stale"
          : delayed
            ? "sheets-delayed"
            : null;
    if (reason)
      add({
        key: "sheets",
        fingerprint: `${setting.mode}:${reason}:${f.target?.successAt ?? "never"}`,
        count: Math.max(1, f.sync.pending),
        severity:
          reason === "sheets-configuration" || reason === "sheets-failed"
            ? "urgent"
            : "warning",
        reason,
        destination: "device",
      });
  }
  return alerts.sort(
    (a, b) =>
      ({ urgent: 0, warning: 1, info: 2 })[a.severity] -
        { urgent: 0, warning: 1, info: 2 }[b.severity] ||
      a.key.localeCompare(b.key),
  );
}
export function canManageAlert(
  action: AlertCommand["action"],
  alert: Pick<OwnerAlert, "severity" | "hidden" | "disposition">,
) {
  if (action === "restore") return alert.hidden;
  if (alert.hidden) return false;
  if (action === "dismiss" || action === "clear")
    return alert.severity === "info";
  if (action === "snooze") return alert.severity !== "urgent";
  return alert.severity === "urgent" && alert.disposition !== "acknowledged";
}
