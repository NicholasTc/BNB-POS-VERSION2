import { z } from "zod";
import { endpoint, json, body, assertOrigin, requireOwner } from "@/lib/http";
import { promoRules } from "@/modules/promos/rules";
import { listPromos, savePromo } from "@/modules/promos/server";
/** Owner role → current promo rules and revisions for management. */
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await listPromos());
});
/** Owner role + Origin/strict rules → revision-checked future promo save; frozen sale discounts remain intact. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  const input = await body(
    request,
    z
      .object({
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
        rules: promoRules,
      })
      .strict()
      .refine((p) => !!p.id === !!p.revision),
  );
  return json(await savePromo(input));
});
