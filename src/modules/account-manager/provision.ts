import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user, account, session, audit } from "@/db/schema";
export async function provisionIdentity(
  role: "owner" | "admin",
  input: { email: string; password: string; reset: boolean },
) {
  const password = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(891101)`);
    const [existing] = await tx
      .select()
      .from(user)
      .where(eq(user.id, role))
      .for("update");
    if (existing && existing.role !== role)
      throw new Error("Account role mismatch.");
    if (existing && !input.reset)
      throw new Error("Account exists. Explicit reset required.");
    if (
      !existing &&
      role === "owner" &&
      (
        await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.role, "owner"))
          .limit(1)
      ).length
    )
      throw new Error("Owner accounts exist. Use Account manager.");
    if (existing) {
      await tx
        .update(user)
        .set({ email: input.email.toLowerCase(), updatedAt: new Date() })
        .where(eq(user.id, role));
      const changed = await tx
        .update(account)
        .set({ password, updatedAt: new Date() })
        .where(
          and(eq(account.userId, role), eq(account.providerId, "credential")),
        )
        .returning({ id: account.id });
      if (changed.length !== 1)
        throw new Error("Credential account unavailable.");
      await tx.delete(session).where(eq(session.userId, role));
    } else {
      await tx
        .insert(user)
        .values({
          id: role,
          role,
          name: role === "admin" ? "Developer" : "Pemilik",
          email: input.email.toLowerCase(),
        });
      await tx
        .insert(account)
        .values({
          id: randomUUID(),
          userId: role,
          accountId: role,
          providerId: "credential",
          password,
        });
    }
    await tx
      .insert(audit)
      .values({
        actor: "local-admin",
        action: `${role}.${existing ? "reset" : "bootstrap"}`,
        details: { userId: role },
      });
  });
}
