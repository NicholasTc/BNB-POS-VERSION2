import { describe, it, expect } from "vitest";
import { diagnosticEvent, diagnosticFrames, diagnosticPath, diagnosticRelease } from "../../src/modules/diagnostics/safe";
import { diagnosticFingerprint } from "../../src/modules/diagnostics/store";
import { diagnosticCopy, technicalHint } from "../../src/modules/diagnostics/copy";
import { diagnosticKinds } from "../../src/modules/diagnostics/types";
const id = "00000000-0000-4000-8000-000000000001";
const at = new Date("2026-11-21T06:00:00Z");
describe("safe readable diagnostics", () => {
  it("drops exception messages, SQL parameters, arbitrary metadata and query secrets", () => {
    const error = Object.assign(new Error("password=private PIN=0123 SELECT bank_amount"), { code: "40P01", stack: "Error: password=private\n at fn (/Users/private/pos/src/modules/sales.ts:42:3)\n at https://example.com/secret?token=private:3:4" });
    const event = diagnosticEvent({ kind: "request_failed", source: "server", path: "/api/sales?pin=0123&token=private", method: "POST", status: 503, error }, id, at, "a".repeat(40));
    expect(event).toMatchObject({ schemaVersion: 1, technicalCode: "40P01", path: "/api/sales", frames: ["src/modules/sales.ts:42:3"], release: "a".repeat(40), httpStatus: 503 });
    for (const secret of ["private", "0123", "SELECT", "bank_amount", "/Users", "password", "token="]) expect(JSON.stringify(event)).not.toContain(secret);
  });
  it("accepts only known paths, codes, methods, error names and commit hashes", () => {
    const event = diagnosticEvent({ kind: "browser_crash", source: "browser", path: "/secret/credential", method: "password", status: 200, error: { name: "sensitive-name", code: "sensitive-code" } }, id, at, "private-environment-value");
    expect(event).toMatchObject({ path: "/unknown", method: "UNKNOWN", httpStatus: null, errorKind: "Error", technicalCode: null, release: "local" });
    expect(diagnosticPath("/api/menu-photos/" + "a".repeat(36) + ".webp")).toBe("/api/menu-photos/:image");
    expect(diagnosticRelease(undefined)).toBe("local");
  });
  it("bounds code locations and excludes homes, message lines and query URLs", () => {
    expect(diagnosticFrames(Array.from({ length: 12 }, (_, i) => `src/lib/client.ts:${i + 1}:2`))).toHaveLength(5);
    expect(diagnosticFrames("credential message\n at https://host/_next/static/chunks/app-123.js:10:2")).toEqual(["_next/static/chunks/app-123.js:10:2"]);
    expect(diagnosticFrames(["password", "/Users/name/secret.json:1:2", "https://host/file.js?password=private:1:2"])).toEqual([]);
  });
  it("groups symptoms without storing or fingerprinting secret error messages", () => {
    const make = (message: string, code = "40P01") => diagnosticEvent({ kind: "request_failed", source: "server", path: "/api/sales", error: Object.assign(new Error(message), { code, stack: "Error\n at src/modules/sales.ts:42:3" }) }, id, at, "local");
    expect(diagnosticFingerprint(make("one private value"))).toBe(diagnosticFingerprint(make("another private value")));
    expect(diagnosticFingerprint(make("same", "40P01"))).not.toBe(diagnosticFingerprint(make("same", "42P01")));
  });
  it("provides an explanation and investigation checks for every captured kind without claiming a cause", () => {
    for (const kind of diagnosticKinds) {
      expect(diagnosticCopy[kind].title.length).toBeGreaterThan(10);
      expect(diagnosticCopy[kind].checks.length).toBeGreaterThanOrEqual(3);
    }
    expect(technicalHint("40P01")).toContain("deadlock");
    expect(technicalHint(null)).toContain("cause is not established");
  });
});
