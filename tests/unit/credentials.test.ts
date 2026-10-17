import { beforeAll, describe, it, expect, vi, afterAll } from "vitest";
import {
  hashPin,
  verifyPin,
  pinLookup,
  digest,
} from "../../src/lib/credentials";
beforeAll(() => {
  vi.stubEnv("PIN_PEPPER", "unit-pepper-".repeat(6));
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/unit");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "unit-secret-".repeat(6));
});
afterAll(() => vi.unstubAllEnvs());
describe("four-digit credentials", () => {
  it("accepts leading zeros and verifies salted hashes", async () => {
    const a = await hashPin("0123"),
      b = await hashPin("0123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("0123");
    expect(await verifyPin("0123", a)).toBe(true);
    expect(await verifyPin("9876", a)).toBe(false);
  });
  it("rejects other lengths and nonnumeric PINs", async () => {
    for (const p of ["123", "12345", "abcd", "12 3"])
      await expect(hashPin(p)).rejects.toThrow();
  });
  it("uses keyed lookup and token digests", () => {
    expect(pinLookup("0123")).toHaveLength(64);
    expect(pinLookup("0123")).not.toBe(digest("0123"));
    expect(pinLookup("0123")).not.toBe(pinLookup("1230"));
  });
});
