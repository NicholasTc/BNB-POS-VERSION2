import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItem } from "@/db/schema";
import { endpoint, json } from "@/lib/http";
import { deviceToken, posState } from "@/modules/attendance";
/** Verify cashier pairing → return available current menu metadata; this does not authorize owner management. */
export const GET = endpoint(async (request) => {
  await posState(deviceToken(request));
  return json(
    await db
      .select({
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        imageUrl: menuItem.imageUrl,
      })
      .from(menuItem)
      .where(eq(menuItem.active, true))
      .orderBy(menuItem.createdAt),
  );
});
