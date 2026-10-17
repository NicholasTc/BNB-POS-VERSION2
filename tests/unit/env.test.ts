import { describe, it, expect } from "vitest";
import { readEnvironment } from "../../src/lib/env";
describe("environment", () => {
  const valid = {
    DATABASE_URL: "postgresql://local/lisi",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "a".repeat(64),
    PIN_PEPPER: "b".repeat(64),
  };
  it("accepts complete configuration", () =>
    expect(readEnvironment(valid).DATABASE_URL).toBe(valid.DATABASE_URL));
  it("rejects missing secrets without printing their values", () => {
    expect(() =>
      readEnvironment({ ...valid, PIN_PEPPER: "secret-value" }),
    ).toThrow("PIN_PEPPER");
    expect(() =>
      readEnvironment({ ...valid, PIN_PEPPER: "secret-value" }),
    ).not.toThrow("secret-value");
  });
  it("rejects non-PostgreSQL databases", () =>
    expect(() =>
      readEnvironment({ ...valid, DATABASE_URL: "https://example.com" }),
    ).toThrow("DATABASE_URL"));
});
