import { createHmac, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, desc, eq, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { user, account, session, ownerCreation, audit } from "@/db/schema";
import { AppError, limit, type requireAdmin } from "@/lib/http";
import { env } from "@/lib/env";
import { OWNER_IDLE_SECONDS, OWNER_SESSION_SECONDS } from "@/lib/auth";
import type { z } from "zod";
import type { newOwnerInput } from "./types";
export async function listOwners(page: number) {
  return db.transaction(
    async (tx) => {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(user)
        .where(eq(user.role, "owner"));
      const owners = await tx
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.role, "owner"))
        .orderBy(desc(user.createdAt), desc(user.id))
        .limit(25)
        .offset((page - 1) * 25);
      return { owners, total, page, pageSize: 25 };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function createOwner(
  admin: Awaited<ReturnType<typeof requireAdmin>>,
  input: z.infer<typeof newOwnerInput>,
) {
  await limit("admin-reauth:" + admin.id, 5, 900);
  const requestHash = createHmac("sha256", env().BETTER_AUTH_SECRET)
    .update(JSON.stringify([input.name, input.email, input.password]))
    .digest("hex");
  try {
    const result = await db.transaction(async (tx) => {
      // Reset/revocation cannot pass this transaction's identity/session locks.
      const [identity] = await tx
        .select()
        .from(user)
        .where(eq(user.id, admin.id))
        .for("share");
      const [active] = await tx
        .select()
        .from(session)
        .where(
          and(eq(session.id, admin.sessionId), eq(session.userId, admin.id)),
        )
        .for("share");
      const now = Date.now();
      if (
        identity?.role !== "admin" ||
        !active ||
        active.expiresAt.getTime() <= now ||
        now - active.updatedAt.getTime() >= OWNER_IDLE_SECONDS * 1000 ||
        now - active.createdAt.getTime() >= OWNER_SESSION_SECONDS * 1000
      )
        throw new AppError(401, "Silakan masuk sebagai administrator.");
      const [credential] = await tx
        .select({ password: account.password })
        .from(account)
        .where(
          and(
            eq(account.userId, admin.id),
            eq(account.providerId, "credential"),
          ),
        )
        .for("share");
      if (
        !credential?.password ||
        !(await verifyPassword({
          hash: credential.password,
          password: input.adminPassword,
        }))
      )
        throw new AppError(403, "Kata sandi administrator tidak sesuai.");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.operationId},891112))`,
      );
      const [receipt] = await tx
        .select()
        .from(ownerCreation)
        .where(eq(ownerCreation.id, input.operationId));
      if (receipt) {
        if (receipt.actorId !== admin.id || receipt.requestHash !== requestHash)
          throw new AppError(
            409,
            "Permintaan akun telah berubah. Periksa daftar pemilik sebelum mencoba lagi.",
          );
        return { id: receipt.ownerId, replayed: true };
      }
      const id = randomUUID(),
        password = await hashPassword(input.password);
      await tx
        .insert(user)
        .values({ id, name: input.name, email: input.email, role: "owner" });
      await tx
        .insert(account)
        .values({
          id: randomUUID(),
          userId: id,
          accountId: id,
          providerId: "credential",
          password,
        });
      await tx
        .insert(ownerCreation)
        .values({
          id: input.operationId,
          actorId: admin.id,
          ownerId: id,
          requestHash,
        });
      await tx
        .insert(audit)
        .values({
          actor: admin.id,
          action: "admin.owner.create",
          details: { ownerId: id, operationId: input.operationId },
        });
      return { id, replayed: false };
    });
    await db.execute(
      sql`UPDATE throttle SET count=greatest(count-1,0) WHERE key=${"admin-reauth:" + admin.id}`,
    );
    return result;
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505")
      throw new AppError(409, "Email sudah terdaftar. Periksa daftar akun.");
    throw error;
  }
}
