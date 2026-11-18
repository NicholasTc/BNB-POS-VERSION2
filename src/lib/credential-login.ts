import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user, session } from "@/db/schema";
import { auth } from "./auth";
import { env } from "./env";
import { body, limit, json } from "./http";

export function privateAuthResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}
export async function credentialLogin(
  request: Request,
  role: "owner" | "admin",
) {
  const prefix = role === "owner" ? "owner-login" : "admin-login";
  await limit(prefix, 10, 60);
  const input = await body(
    request,
    z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
        password: z.string().min(1).max(128),
      })
      .strict(),
  );
  await limit(prefix + "-failures", 10, 900);
  const response = await auth.handler(
    new Request(new URL("/api/auth/sign-in/email", env().BETTER_AUTH_URL), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(input),
    }),
  );
  if (response.ok) {
    // Password verification is always handled by Better Auth. Portal selection
    // never grants a role. A wrong-portal login is revoked before cookies leave.
    const result = await response.clone().json();
    const [identity] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, result.user.id));
    if (identity?.role !== role) {
      await db
        .delete(session)
        .where(
          and(
            eq(session.token, result.token),
            eq(session.userId, result.user.id),
          ),
        );
      return json({ error: "Email atau kata sandi tidak sesuai." }, 401);
    }
    await db.execute(
      sql`UPDATE throttle SET count=greatest(count-1,0) WHERE key=${prefix + "-failures"}`,
    );
  }
  if (response.status >= 500)
    console.error(
      JSON.stringify({
        event: "credential_login_unavailable",
        portal: role,
        status: response.status,
      }),
    );
  return privateAuthResponse(response);
}
