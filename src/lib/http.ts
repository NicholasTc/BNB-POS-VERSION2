import { z } from "zod";
import { auth, OWNER_SESSION_SECONDS, OWNER_IDLE_SECONDS } from "./auth";
import { env } from "./env";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { session as ownerSession, user } from "@/db/schema";
import { recordDiagnostic } from "@/modules/diagnostics/record";
import { diagnosticCode, diagnosticPath } from "@/modules/diagnostics/safe";
export class AppError extends Error {
  /** Carry a deliberately user-safe HTTP status/message for expected validation, authorization or conflict failures. */
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Require exact canonical Origin and JSON for state-changing JSON routes; this does not authenticate the caller. */
export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(env().BETTER_AUTH_URL).origin)
    throw new AppError(403, "Permintaan tidak diizinkan. Muat ulang halaman.");
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new AppError(415, "Format permintaan tidak didukung.");
}
/** Stream at most 16 KiB of request text and release the reader; reject oversized bodies before full buffering. */
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
/** Bounded text → JSON parse → strict route schema; return validated input or a generic safe 400 response. */
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
/** Require a live database-backed owner-role session, not a cashier PIN or browser-submitted role. */
export async function requireOwner(request: Request) {
  return requireRole(request, "owner");
}
/** Require the reserved administrator role through the same database-backed session checks. */
export async function requireAdmin(request: Request) {
  return requireRole(request, "admin");
}
/** Read the real SQL identity on every privileged request, enforce absolute/idle expiry and update only interactive idle activity. Background GETs never keep access alive. */
async function requireRole(request: Request, role: "owner" | "admin") {
  const message =
    role === "admin"
      ? "Silakan masuk sebagai administrator."
      : "Silakan masuk sebagai pemilik.";
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
  if (!session) throw new AppError(401, message);
  // Role is read from SQL on every request, never trusted from the browser.
  const [identity] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id));
  if (identity?.role !== role) throw new AppError(401, message);
  const now = Date.now();
  if (
    now - session.session.createdAt.getTime() >= OWNER_SESSION_SECONDS * 1000 ||
    now - session.session.updatedAt.getTime() >= OWNER_IDLE_SECONDS * 1000
  ) {
    await db
      .delete(ownerSession)
      .where(eq(ownerSession.id, session.session.id));
    throw new AppError(401, message);
  }
  if (!(
    request.method === "GET" && request.headers.get("x-lisi-background") === "1"
  )) {
    const updated = await db
      .update(ownerSession)
      .set({ updatedAt: new Date(now) })
      .where(eq(ownerSession.id, session.session.id))
      .returning({ id: ownerSession.id });
    if (!updated.length) throw new AppError(401, message);
  }
  return { ...session.user, sessionId: session.session.id };
}
/** Atomically reserve a per-key SQL throttle slot across processes; callers choose trusted scope keys rather than browser-supplied identity/IP. */
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
/** Return JSON with no-store so protected API results are not reused from HTTP caches. */
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
/** Run one route → preserve expected safe errors → report unexpected/5xx failures outside business transactions → return sanitized status/reference. Collector/viewer failures are excluded from recursive collection. */
export function endpoint(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    // Collector/viewer failures must never feed back into their own storage.
    const path = new URL(request.url).pathname;
    const diagnosticRoute = path === "/api/diagnostics" || path === "/api/admin/logs";
    try {
      const response = await fn(request);
      if (response.status >= 500 && !diagnosticRoute) {
        const reference = recordDiagnostic({ kind: "request_failed", source: "server", path, method: request.method, status: response.status });
        if (reference) {
          const headers = new Headers(response.headers);
          headers.set("X-Lisi-Error-Id", reference);
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        }
      }
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        const reference = error.status >= 500 && !diagnosticRoute ? recordDiagnostic({ kind: "request_failed", source: "server", path, method: request.method, status: error.status, error }) : null;
        return json({ error: error.message, ...(reference ? { reference } : {}) }, error.status);
      }
      const cause = error as { code?: string; cause?: { code?: string } };
      const code = cause?.cause?.code ?? cause?.code;
      const reference = diagnosticRoute ? null : recordDiagnostic({ kind: "request_failed", source: "server", path, method: request.method, status: 503, error });
      if (!reference) console.error(
        JSON.stringify({
          event: "request_failed",
          at: new Date().toISOString(),
          path: diagnosticPath(path),
          kind: "Error",
          ...(diagnosticCode(code) ? { code: diagnosticCode(code) } : {}),
        }),
      );
      return json(
        {
          error:
            "Layanan belum tersedia. Data belum dikonfirmasi; coba periksa kembali.",
          ...(reference ? { reference } : {}),
        },
        503,
      );
    }
  };
}
