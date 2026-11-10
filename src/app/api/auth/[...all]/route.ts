import { auth } from "@/lib/auth";
import { AppError, assertOrigin, endpoint, body } from "@/lib/http";
import { z } from "zod";
import { db } from "@/db";
import { session } from "@/db/schema";
import { eq } from "drizzle-orm";
import { credentialLogin, privateAuthResponse } from "@/lib/credential-login";
export const runtime = "nodejs";
export const GET = endpoint(async (request) => {
  if (new URL(request.url).pathname !== "/api/auth/get-session")
    throw new AppError(404, "Halaman tidak ditemukan.");
  return privateAuthResponse(await auth.handler(request));
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path))
    throw new AppError(404, "Halaman tidak ditemukan.");
  if (path.endsWith("sign-in/email")) return credentialLogin(request, "owner");
  {
    await body(request, z.object({}).strict());

    const current = await auth.api.getSession({
      headers: request.headers,
      query: { disableRefresh: true },
    });
    // The library's sign-out handler suppresses database deletion errors.
    // Revoke explicitly first so handoff fails closed if persistence fails.
    if (current)
      await db.delete(session).where(eq(session.id, current.session.id));
  }
  return privateAuthResponse(
    await auth.handler(new Request(request, { body: "{}" })),
  );
});
