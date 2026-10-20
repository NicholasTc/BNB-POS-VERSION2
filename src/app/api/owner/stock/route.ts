import { z } from "zod";
import {
  endpoint,
  json,
  body,
  assertOrigin,
  requireOwner,
  AppError,
} from "@/lib/http";
import { stockCommand } from "@/modules/stock/types";
import {
  stockItems,
  getStockRecipe,
  stockHistory,
  stockReceipt,
  runStockCommand,
} from "@/modules/stock/server";
const query = z.discriminatedUnion("view", [
  z.object({ view: z.literal("items") }).strict(),
  z.object({ view: z.literal("recipe"), menuItemId: z.uuid() }).strict(),
  z
    .object({
      view: z.literal("history"),
      stockItemId: z.uuid().optional(),
      cursor: z.uuid().optional(),
    })
    .strict(),
  z.object({ view: z.literal("command"), id: z.uuid() }).strict(),
]);
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== Array.from(params.keys()).length)
    throw new AppError(400, "Filter stok tidak valid.");
  const input = query.safeParse({
    view: "items",
    ...Object.fromEntries(params),
  });
  if (!input.success) throw new AppError(400, "Filter stok tidak valid.");
  const q = input.data;
  return json(
    q.view === "items"
      ? await stockItems()
      : q.view === "recipe"
        ? await getStockRecipe(q.menuItemId)
        : q.view === "history"
          ? await stockHistory(q.stockItemId, q.cursor)
          : await stockReceipt(q.id),
  );
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  return json(await runStockCommand(await body(request, stockCommand)));
});
