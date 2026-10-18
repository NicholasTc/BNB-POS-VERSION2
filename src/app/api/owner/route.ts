import { endpoint, json, requireOwner } from "@/lib/http";
import { db } from "@/db";
import { ownerPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
export const GET = endpoint(async (request) => {
  const owner = await requireOwner(request);
  const [preference] = await db
    .select()
    .from(ownerPreferences)
    .where(eq(ownerPreferences.ownerId, owner.id));
  return json({ name: owner.name, language: preference?.language ?? "id" });
});
