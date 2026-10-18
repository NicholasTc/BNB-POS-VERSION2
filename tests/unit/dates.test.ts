import { describe, it, expect } from "vitest";
import { businessRange, localTime } from "../../src/lib/dates";
import { datePreset } from "../../src/lib/owner-dates";
describe("Jakarta reporting boundaries", () => {
  it("uses inclusive calendar presets across month, year and leap boundaries", () => {
    expect(datePreset("today", "2026-10-18")).toEqual({
      from: "2026-10-18",
      to: "2026-10-18",
    });
    expect(datePreset("yesterday", "2027-01-01")).toEqual({
      from: "2026-12-31",
      to: "2026-12-31",
    });
    expect(datePreset("week", "2028-03-01")).toEqual({
      from: "2028-02-24",
      to: "2028-03-01",
    });
    const range = datePreset("week", "2026-10-18");
    const bounds = businessRange(range.from, range.to);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(7 * 86400000);
    expect(bounds.start.toISOString()).toBe("2026-10-11T17:00:00.000Z");
  });
  it("includes a full local day using half-open UTC bounds", () => {
    const r = businessRange("2026-10-17", "2026-10-17");
    expect(r.start.toISOString()).toBe("2026-10-16T17:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-17T17:00:00.000Z");
  });
  it("handles leap day and year boundaries", () => {
    expect(businessRange("2028-02-29", "2028-02-29").end.toISOString()).toBe(
      "2028-02-29T17:00:00.000Z",
    );
    expect(businessRange("2026-12-31", "2027-01-01").end.toISOString()).toBe(
      "2027-01-01T17:00:00.000Z",
    );
  });
  it("rejects nonexistent dates, reversed or oversized ranges", () => {
    for (const [a, b] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-02-29", "2026-03-01"],
      ["2026-10-18", "2026-10-17"],
      ["2020-01-01", "2026-01-01"],
      ["invalid", "invalid"],
    ])
      expect(() => businessRange(a, b)).toThrow();
  });
  it("formats timestamps in the business timezone", () =>
    expect(localTime("2026-10-16T17:00:00Z")).toContain("17 Okt 2026"));
});
