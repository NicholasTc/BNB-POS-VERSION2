import { z } from "zod";
export const alertKeys = [
  "categories",
  "stock-low",
  "stock-negative",
  "sheets",
  "payment-pending",
  "payment-paid",
] as const;
export const alertKey = z.enum(alertKeys);
export type AlertKey = z.infer<typeof alertKey>;
export type AlertDestination = "menu" | "stock" | "device" | "transactions";
export type AlertReason =
  | "categories"
  | "stock-low"
  | "stock-negative"
  | "sheets-configuration"
  | "sheets-failed"
  | "sheets-stale"
  | "sheets-delayed"
  | "payment-pending"
  | "payment-paid";
export type AlertCandidate = {
  key: AlertKey;
  fingerprint: string;
  severity: "info" | "warning" | "urgent";
  reason: AlertReason;
  count: number;
  destination: AlertDestination;
};
export type OwnerAlert = Omit<AlertCandidate, "fingerprint"> & {
  version: number;
  disposition: "none" | "dismissed" | "snoozed" | "acknowledged";
  snoozedUntil: string | null;
  firstSeenAt: string;
  hidden: boolean;
};
export type AlertFeed = {
  items: OwnerAlert[];
  visibleCount: number;
  urgentCount: number;
  observedAt: string;
};
const target = z
  .object({ key: alertKey, version: z.number().int().positive() })
  .strict();
export const alertCommand = z
  .object({
    action: z.enum(["dismiss", "snooze", "acknowledge", "restore", "clear"]),
    targets: z
      .array(target)
      .min(1)
      .max(alertKeys.length)
      .refine((a) => new Set(a.map((t) => t.key)).size === a.length),
  })
  .strict();
export type AlertCommand = z.infer<typeof alertCommand>;
export const PAID_GRACE_MS = 2 * 60 * 1000;
export const PENDING_GRACE_MS = 15 * 60 * 1000;
export const SNOOZE_MS = 60 * 60 * 1000;
