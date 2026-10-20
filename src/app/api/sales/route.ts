import { z } from "zod";
import { endpoint, json, assertOrigin, body } from "@/lib/http";
import { deviceToken } from "@/modules/attendance";
import { prepareSale, getSale, changeSale } from "@/modules/sales";
import { promoSelection } from "@/modules/promos/rules";
const prepare = z
  .object({
    action: z.literal("prepare"),
    id: z.uuid(),
    generation: z.number().int().nonnegative(),
    paymentMethod: z.enum(["cash", "qris"]),
    promos: promoSelection.optional(),
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            quantity: z.number().int().min(1).max(99),
            unitPrice: z.number().int().min(1).max(100000000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
const change = z
  .object({
    action: z.enum(["attest", "complete", "cancel"]),
    id: z.uuid(),
    paymentReceived: z.literal(true).optional(),
    paymentNotReceived: z.literal(true).optional(),
  })
  .strict();
export const GET = endpoint(async (request) => {
  const value = new URL(request.url).searchParams.get("id");
  if (value && !z.uuid().safeParse(value).success)
    return json({ error: "Referensi tidak valid." }, 400);
  return json(await getSale(deviceToken(request), value ?? undefined));
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const input = await body(request, z.union([prepare, change]));
  const token = deviceToken(request);
  return json(
    input.action === "prepare"
      ? await prepareSale(token, input)
      : await changeSale(token, input),
  );
});
