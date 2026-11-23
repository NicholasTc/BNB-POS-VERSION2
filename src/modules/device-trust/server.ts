import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { device } from "@/db/schema";
import { deviceTrustStatus } from "./policy";

/** Owner-authorized read → select only token-presence and stored expiry → server-calculated remaining days. No token/hash is returned and no pairing, activity or expiry is renewed. */
export async function readDeviceTrust() {
  const [pairing] = await db
    .select({
      paired: sql<boolean>`${device.tokenHash} IS NOT NULL`,
      expiresAt: device.expiresAt,
    })
    .from(device)
    .where(eq(device.id, "shared"));
  return deviceTrustStatus(pairing);
}
