import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItem } from "@/db/schema";
import { endpoint, json } from "@/lib/http";
import { deviceToken, posState } from "@/modules/attendance";
export const GET = endpoint(async (request) => {
  await posState(deviceToken(request));
  return json(
    await db
      .select({ id: menuItem.id, name: menuItem.name, price: menuItem.price })
      .from(menuItem)
      .where(eq(menuItem.active, true))
      .orderBy(menuItem.createdAt),
  );
});
