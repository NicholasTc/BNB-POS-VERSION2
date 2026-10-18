import { describe, it, expect } from "vitest";
import { ownerEnglish, ownerMessage } from "../../src/lib/owner-language";
import { localTime } from "../../src/lib/dates";
describe("owner language", () => {
  it("provides English for every owner dictionary entry", () => {
    expect(
      Object.values(ownerEnglish).every((text) => text.trim().length > 0),
    ).toBe(true);
    expect(ownerEnglish["Pendapatan tercatat"]).toBe("Recorded revenue");
    expect(ownerEnglish["Selesai kerja"]).toBe("Clock-out");
  });
  it("localizes actionable server errors without changing their meaning", () => {
    expect(
      ownerMessage("Selesaikan shift sebelum menonaktifkan karyawan.", "en"),
    ).toBe("End the employee's shift before deactivating them.");
    expect(ownerMessage("PIN sudah digunakan. Pilih PIN lain.", "id")).toBe(
      "PIN sudah digunakan. Pilih PIN lain.",
    );
    expect(ownerMessage("Invalid email or password", "id")).toBe(
      "Email atau kata sandi tidak cocok.",
    );
    expect(ownerMessage("unrecognized internal failure", "en")).not.toContain(
      "internal",
    );
  });
  it("keeps Jakarta time when formatting English dates", () => {
    expect(localTime("2026-10-16T17:00:00Z", "en")).toContain("17 Oct 2026");
    expect(localTime("2026-10-16T17:00:00Z", "en")).toContain("00:00");
  });
});
