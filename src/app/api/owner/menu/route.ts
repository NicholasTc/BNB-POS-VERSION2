import { z } from "zod";
import { db } from "@/db";
import { menuItem } from "@/db/schema";
import { endpoint, json, assertOrigin, body, requireOwner } from "@/lib/http";
import { saveMenu } from "@/modules/sales";
import { menuCategory, menuImage } from "@/lib/menu";
/** Owner role → current catalogue for management; no historical sale snapshots are modified. */
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await db.select().from(menuItem).orderBy(menuItem.createdAt));
});
/** Owner role + Origin/strict schema → menu/photo-reference transaction and audit. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  const input = await body(
    request,
    z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(80),
        price: z.number().int().min(1).max(100000000),
        active: z.boolean(),
        category: menuCategory.optional(),
        imageUrl: menuImage.optional(),
        expectedImageUrl: menuImage.optional(),
      })
      .strict(),
  );
  await saveMenu(input);
  return json({ ok: true });
});
