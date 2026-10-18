import { z } from "zod";
import { db } from "@/db";
import { ownerPreferences } from "@/db/schema";
import { assertOrigin, body, endpoint, json, requireOwner } from "@/lib/http";

export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const owner = await requireOwner(request);
  const input = await body(
    request,
    z.object({ language: z.enum(["id", "en"]) }).strict(),
  );
  await db
    .insert(ownerPreferences)
    .values({ ownerId: owner.id, language: input.language })
    .onConflictDoUpdate({
      target: ownerPreferences.ownerId,
      set: { language: input.language },
    });
  return json(input);
});
