import { describe, it, expect } from "vitest";
import { stockCommand, recipeLines } from "../../src/modules/stock/types";
const id = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
describe("stock command boundaries", () => {
  it("accepts practical whole-unit counts and bounded recipe quantities", () => {
    expect(
      stockCommand.parse({
        id,
        action: "create",
        name: " Cup ",
        unit: "pcs",
        openingQuantity: 100,
        lowThreshold: 20,
      }),
    ).toMatchObject({ name: "Cup" });
    expect(
      stockCommand.safeParse({
        id,
        action: "adjust",
        stockItemId: other,
        revision: 1,
        quantity: 0,
        reason: "Physical count",
      }).success,
    ).toBe(true);
    expect(recipeLines.parse([{ stockItemId: id, quantity: 2 }])).toHaveLength(
      1,
    );
    expect(recipeLines.parse([])).toEqual([]);
  });
  it("rejects decimals, negative counts, identity fields, missing reasons and duplicated ingredients", () => {
    for (const quantity of [-1, 0, 1.5, 1000000001])
      expect(
        stockCommand.safeParse({
          id,
          action: "restock",
          stockItemId: other,
          quantity,
          reason: "",
        }).success,
      ).toBe(false);
    expect(
      stockCommand.safeParse({
        id,
        action: "adjust",
        stockItemId: other,
        revision: 1,
        quantity: 5,
        reason: " ",
      }).success,
    ).toBe(false);
    expect(
      stockCommand.safeParse({
        id,
        action: "restock",
        stockItemId: other,
        quantity: 1,
        reason: "",
        actor: "owner",
      }).success,
    ).toBe(false);
    expect(
      recipeLines.safeParse([
        { stockItemId: id, quantity: 1 },
        { stockItemId: id, quantity: 2 },
      ]).success,
    ).toBe(false);
    expect(
      recipeLines.safeParse([{ stockItemId: id, quantity: 0.5 }]).success,
    ).toBe(false);
  });
});
