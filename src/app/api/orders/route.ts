import { z } from "zod";
import { endpoint, json, assertOrigin, body, AppError } from "@/lib/http";
import { deviceToken } from "@/modules/attendance";
import { readOrders, finishOrder } from "@/modules/orders/server";

const query = z
  .object({
    pendingAfter: z.uuid().optional(),
    finishedBefore: z.uuid().optional(),
  })
  .strict();
export const GET = endpoint(async (request) => {
  const search = new URL(request.url).searchParams;
  const parsed = query.safeParse(Object.fromEntries(search));
  if (
    !parsed.success ||
    [...search.keys()].length !== new Set(search.keys()).size
  )
    throw new AppError(400, "Halaman pesanan tidak valid.");
  return json(await readOrders(deviceToken(request), parsed.data));
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const input = await body(
    request,
    z
      .object({ id: z.uuid(), generation: z.number().int().nonnegative() })
      .strict(),
  );
  const token = deviceToken(request);
  await finishOrder(token, input.id, input.generation);
  return json({ ok: true });
});
