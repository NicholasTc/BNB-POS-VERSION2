import { endpoint, json, requireAdmin, assertOrigin, body } from "@/lib/http";
import { credentialLogin, privateAuthResponse } from "@/lib/credential-login";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { session } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
export const runtime = "nodejs";
/** SQL administrator session/role/expiry check → public identity only; passive reads preserve idle expiry. */
export const GET = endpoint(async (request) => {
  const admin = await requireAdmin(request);
  return json({ name: admin.name, email: admin.email });
});
/** Exact-origin strict credentials → administrator portal login; wrong-role sessions are revoked before cookies leave. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  return credentialLogin(request, "admin");
});
/** Admin role + Origin → durable deletion of this session → clear authentication cookie. */
export const DELETE = endpoint(async (request) => {
  assertOrigin(request);
  await body(request, z.object({}).strict());
  const admin = await requireAdmin(request);
  await db.delete(session).where(eq(session.id, admin.sessionId));
  // Clear the cookie after durable revocation; library errors cannot skip SQL.
  return privateAuthResponse(
    await auth.handler(
      new Request(new URL("/api/auth/sign-out", request.url), {
        method: "POST",
        headers: request.headers,
        body: "{}",
      }),
    ),
  );
});
