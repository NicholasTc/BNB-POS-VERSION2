import { it, expect } from "vitest";
import {
  detectAlerts,
  canManageAlert,
  type AlertFacts,
} from "../../src/modules/alerts/rules";
import { alertCommand } from "../../src/modules/alerts/types";
const now = new Date("2026-11-02T08:00:00Z");
const empty = (): AlertFacts => ({
  categories: { count: 0, fingerprint: "c" },
  low: { count: 0, fingerprint: "l" },
  negative: { count: 0, fingerprint: "n" },
  pending: { count: 0, fingerprint: "p" },
  paid: { count: 0, fingerprint: "d" },
  sync: { pending: 0, failed: 0, oldest: null },
  target: null,
});
it("groups issues with urgent first and ignores intentionally disabled Sheets", () => {
  const f = empty();
  f.categories.count = 5;
  f.low.count = 3;
  f.negative.count = 2;
  f.paid.count = 1;
  f.sync.failed = 3;
  const alerts = detectAlerts(f, { mode: "off" }, now);
  expect(alerts).toHaveLength(4);
  expect(alerts.slice(0, 2).every((a) => a.severity === "urgent")).toBe(true);
  expect(alerts.find((a) => a.key === "categories")?.count).toBe(5);
});
it("flags invalid destination config and worker check-in without exposing raw error bodies", () => {
  const f = empty();
  expect(detectAlerts(f, { mode: "configuration" }, now)[0]).toMatchObject({
    reason: "sheets-configuration",
    severity: "urgent",
  });
  expect(
    detectAlerts(f, { mode: "test", spreadsheetId: "test" }, now)[0],
  ).toMatchObject({ reason: "sheets-stale" });
  f.target = {
    mode: "test",
    spreadsheetId: "other",
    attemptedAt: now.toISOString(),
    successAt: null,
    error: "raw credential",
  };
  expect(
    JSON.stringify(
      detectAlerts(f, { mode: "test", spreadsheetId: "test" }, now),
    ),
  ).not.toContain("raw credential");
});
it("allows normal export latency and warns only on an old pending queue", () => {
  const f = empty();
  f.target = {
    mode: "test",
    spreadsheetId: "test",
    attemptedAt: now.toISOString(),
    successAt: null,
    error: null,
  };
  f.sync = { pending: 1, failed: 0, oldest: now.toISOString() };
  expect(detectAlerts(f, { mode: "test", spreadsheetId: "test" }, now)).toEqual(
    [],
  );
  f.sync.oldest = new Date(now.getTime() - 121000).toISOString();
  expect(
    detectAlerts(f, { mode: "test", spreadsheetId: "test" }, now)[0].reason,
  ).toBe("sheets-delayed");
});
it("never permits urgent dismissal/snooze and restricts clear-all to informational alerts", () => {
  const urgent = {
    severity: "urgent" as const,
    hidden: false,
    disposition: "none" as const,
  };
  for (const action of ["clear", "dismiss", "snooze"] as const)
    expect(canManageAlert(action, urgent)).toBe(false);
  expect(canManageAlert("acknowledge", urgent)).toBe(true);
  expect(
    canManageAlert("acknowledge", { ...urgent, disposition: "acknowledged" }),
  ).toBe(false);
  expect(canManageAlert("clear", { ...urgent, severity: "warning" })).toBe(
    false,
  );
  expect(canManageAlert("clear", { ...urgent, severity: "info" })).toBe(true);
  expect(
    canManageAlert("restore", {
      ...urgent,
      severity: "info",
      hidden: true,
      disposition: "dismissed",
    }),
  ).toBe(true);
});
it("rejects duplicate/stale-shaped/forged targets and unbounded command bodies", () => {
  const target = { key: "categories", version: 1 };
  expect(
    alertCommand.safeParse({ action: "clear", targets: [target] }).success,
  ).toBe(true);
  for (const targets of [
    [],
    [target, target],
    [{ ...target, version: 0 }],
    [{ ...target, ownerId: "owner" }],
  ])
    expect(alertCommand.safeParse({ action: "dismiss", targets }).success).toBe(
      false,
    );
  expect(
    alertCommand.safeParse({ action: "delete-sales", targets: [target] })
      .success,
  ).toBe(false);
});
