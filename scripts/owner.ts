import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(process.cwd() + "/package.json")(
  "@next/env",
) as typeof import("@next/env");
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";
loadEnvConfig(process.cwd());
// Read secrets from hidden stdin, never command arguments or tracked files.
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
let credentials: { email: string; password: string; reset: boolean };
try {
  credentials = z
    .object({
      email: z.email(),
      password: z.string().min(12).max(128),
      reset: z.boolean().default(false),
    })
    .parse(JSON.parse(Buffer.concat(chunks).toString()));
} catch {
  console.error(
    "Invalid provisioning input. Email and 12–128 character password required.",
  );
  process.exit(1);
}
const { db, pool } = await import("../src/db/index");
const { user, account, session, audit } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
try {
  const password = await hashPassword(credentials.password);
  await db.transaction(async (tx) => {
    await tx.execute(
      (await import("drizzle-orm")).sql`SELECT pg_advisory_xact_lock(891101)`,
    );
    const existing = await tx.select().from(user);
    if (existing.length && !credentials.reset)
      throw new Error("Owner exists. Explicit reset required.");
    if (existing.length) {
      await tx
        .update(user)
        .set({ email: credentials.email.toLowerCase(), updatedAt: new Date() })
        .where(eq(user.id, "owner"));
      await tx
        .update(account)
        .set({ password, updatedAt: new Date() })
        .where(eq(account.userId, "owner"));
      await tx.delete(session);
    } else {
      await tx
        .insert(user)
        .values({
          id: "owner",
          name: "Pemilik",
          email: credentials.email.toLowerCase(),
        });
      await tx
        .insert(account)
        .values({
          id: randomUUID(),
          userId: "owner",
          accountId: "owner",
          providerId: "credential",
          password,
        });
    }
    await tx
      .insert(audit)
      .values({
        actor: "local-admin",
        action: existing.length ? "owner.reset" : "owner.bootstrap",
      });
  });
  console.log(
    "Owner credentials saved; previous owner sessions revoked on reset.",
  );
} catch (error) {
  console.error(
    error instanceof Error &&
      error.message === "Owner exists. Explicit reset required."
      ? error.message
      : "Owner provisioning failed. Check database availability and input.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
