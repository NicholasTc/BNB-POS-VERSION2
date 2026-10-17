import "../setup";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import databaseLock from "../database-lock";
export default async function setup() {
  const release = await databaseLock();
  const { db, pool } = await import("../../src/db");
  const { user, account } = await import("../../src/db/schema");
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await pool.query(
      "TRUNCATE owner_user, employee, device, throttle, auth_rate_limit CASCADE",
    );
    await db
      .insert(user)
      .values({ id: "owner", email: "owner@test.local", name: "Pemilik" });
    await db.insert(account).values({
      id: "e2e",
      accountId: "owner",
      userId: "owner",
      providerId: "credential",
      password: await hashPassword("test-owner-password-2026"),
    });
  } catch (error) {
    await release();
    throw error;
  } finally {
    await pool.end();
  }
  return release;
}
