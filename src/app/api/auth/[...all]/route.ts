import { auth } from "@/lib/auth";
import { AppError, assertOrigin, endpoint, limit, body } from "@/lib/http";
import { z } from "zod";
import { db } from "@/db";
import { session } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}
export const runtime = "nodejs";
export const GET = endpoint(async (request) => {
  if (new URL(request.url).pathname !== "/api/auth/get-session")
    throw new AppError(404, "Halaman tidak ditemukan.");
  return privateResponse(await auth.handler(request));
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path))
    throw new AppError(404, "Halaman tidak ditemukan.");
  let raw: string;
  if (path.endsWith("sign-in/email")) {
    await limit("owner-login", 10, 60);
    const input = await body(
      request,
      z
        .object({
          email: z.email().max(254),
          password: z.string().min(1).max(128),
        })
        .strict(),
    );
    // Reserve failure capacity before hashing. Success releases only this
    // request's reservation, never erasing other failed attempts.
    await limit("owner-login-failures", 10, 900);
    raw = JSON.stringify(input);
  } else {
    await body(request, z.object({}).strict());
    raw = "{}";
    const current = await auth.api.getSession({
      headers: request.headers,
      query: { disableRefresh: true },
    });
    // The library's sign-out handler suppresses database deletion errors.
    // Revoke explicitly first so handoff fails closed if persistence fails.
    if (current)
      await db.delete(session).where(eq(session.id, current.session.id));
  }
  const response = await auth.handler(new Request(request, { body: raw }));
  if (path.endsWith("sign-in/email") && response.ok)
    await db.execute(
      sql`UPDATE throttle SET count=greatest(count-1,0) WHERE key='owner-login-failures'`,
    );
  if (response.status >= 500)
    console.error(
      JSON.stringify({
        event: "owner_auth_unavailable",
        at: new Date().toISOString(),
        path,
        status: response.status,
      }),
    );
  return privateResponse(response);
});
