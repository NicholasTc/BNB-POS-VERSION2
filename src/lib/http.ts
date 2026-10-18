import { z } from "zod";
import { auth, OWNER_SESSION_SECONDS, OWNER_IDLE_SECONDS } from "./auth";
import { env } from "./env";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { session as ownerSession } from "@/db/schema";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(env().BETTER_AUTH_URL).origin)
    throw new AppError(403, "Permintaan tidak diizinkan. Muat ulang halaman.");
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new AppError(415, "Format permintaan tidak didukung.");
}
export async function limitedText(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    throw new AppError(413, "Permintaan terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let raw = "",
    size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError(413, "Permintaan terlalu besar.");
      }
      raw += decoder.decode(next.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function body<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await limitedText(request);
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new AppError(400, "Periksa kembali data yang dimasukkan.");
  }
}
export async function requireOwner(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
    // Library refresh is disabled globally. Activity below updates only the
    // idle timestamp; neither passive nor interactive requests extend expiry.
    query: {
      disableRefresh:
        request.method === "GET" &&
        request.headers.get("x-lisi-background") === "1",
    },
  });
  if (session?.user.id !== "owner")
    throw new AppError(401, "Silakan masuk sebagai pemilik.");
  const now = Date.now();
  if (
    now - session.session.createdAt.getTime() >= OWNER_SESSION_SECONDS * 1000 ||
    now - session.session.updatedAt.getTime() >= OWNER_IDLE_SECONDS * 1000
  ) {
    await db
      .delete(ownerSession)
      .where(eq(ownerSession.id, session.session.id));
    throw new AppError(401, "Silakan masuk sebagai pemilik.");
  }
  if (!(
    request.method === "GET" && request.headers.get("x-lisi-background") === "1"
  )) {
    const updated = await db
      .update(ownerSession)
      .set({ updatedAt: new Date(now) })
      .where(eq(ownerSession.id, session.session.id))
      .returning({ id: ownerSession.id });
    if (!updated.length)
      throw new AppError(401, "Silakan masuk sebagai pemilik.");
  }
  return session.user;
}
export async function limit(key: string, max: number, seconds: number) {
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO throttle (key, count, reset_at) VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN throttle.reset_at <= now() THEN 1 ELSE throttle.count + 1 END,
    reset_at = CASE WHEN throttle.reset_at <= now() THEN now() + ${seconds} * interval '1 second' ELSE throttle.reset_at END
    RETURNING count`);
  if (result.rows[0].count > max)
    throw new AppError(
      429,
      "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
    );
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function endpoint(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof AppError)
        return json({ error: error.message }, error.status);
      const cause = error as { code?: string; cause?: { code?: string } };
      const code = cause?.cause?.code ?? cause?.code;
      console.error(
        JSON.stringify({
          event: "request_failed",
          at: new Date().toISOString(),
          path: new URL(request.url).pathname,
          kind: error instanceof Error ? error.name : "unknown",
          ...(code && /^[A-Z0-9_]{1,32}$/.test(code) ? { code } : {}),
        }),
      );
      return json(
        {
          error:
            "Layanan belum tersedia. Data belum dikonfirmasi; coba periksa kembali.",
        },
        503,
      );
    }
  };
}
