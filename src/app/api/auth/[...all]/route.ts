import { auth } from "@/lib/auth";
import {
  AppError,
  assertOrigin,
  endpoint,
  limit,
  limitedText,
} from "@/lib/http";
export const runtime = "nodejs";
export const GET = endpoint(async (request) => {
  if (new URL(request.url).pathname !== "/api/auth/get-session")
    throw new AppError(404, "Halaman tidak ditemukan.");
  return auth.handler(request);
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path))
    throw new AppError(404, "Halaman tidak ditemukan.");
  if (path.endsWith("sign-in/email")) await limit("owner-login", 10, 60);
  const response = await auth.handler(
    new Request(request, { body: await limitedText(request) }),
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
  return response;
});
