import { describe, expect, it } from "vitest";
import { cashAmount, cashKey, cashSuggestions } from "../../src/lib/cash";
import { menuImage, menuCategory } from "../../src/lib/menu";
describe("cash entry boundaries", () => {
  it("accepts whole rupiah and bounds input without unsafe overflow", () => {
    expect(cashAmount("100000")).toBe(100000);
    for (const value of [
      "",
      "-100",
      "1.5",
      "1e6",
      "2000000001",
      "9999999999999999",
    ])
      expect(cashAmount(value)).toBeNull();
    expect(cashAmount("2000000000")).toBe(2000000000);
  });
  it("supports keypad triples, leading zeros, deletion and overflow rejection", () => {
    expect(cashKey("1", "000")).toBe("1000");
    expect(cashKey("0", "1")).toBe("1");
    expect(cashKey("100", "backspace")).toBe("10");
    expect(cashKey("", "backspace")).toBe("");
    expect(cashKey("2000000000", "0")).toBe("2000000000");
  });
  it("suggests exact and rounded sufficient amounts without duplicate buttons", () => {
    expect(cashSuggestions(58000)).toEqual([58000, 60000, 100000]);
    expect(cashSuggestions(100000)).toEqual([100000]);
    expect(cashSuggestions(1_000_000_000)).toEqual([1_000_000_000]);
  });
});
describe("owner menu metadata", () => {
  it("accepts local placeholders and HTTPS photos, rejecting executable or insecure URLs", () => {
    for (const value of [
      "",
      "/menu/mango.webp",
      "https://images.example/photo.jpg",
    ])
      expect(menuImage.safeParse(value).success).toBe(true);
    for (const value of [
      "javascript:alert(1)",
      "data:image/svg+xml,x",
      "http://images.example/x",
      "//evil.example/x",
      "/menu/../../secret",
      "x".repeat(2001),
    ])
      expect(menuImage.safeParse(value).success).toBe(false);
    expect(menuCategory.safeParse("drink").success).toBe(true);
    expect(menuCategory.safeParse("untrusted").success).toBe(false);
  });
});
