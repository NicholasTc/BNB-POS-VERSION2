import { z } from "zod";
import { env } from "@/lib/env";
import { endpoint, assertOrigin, requireOwner, body, json } from "@/lib/http";
import { DEVICE_COOKIE, pairDevice, revokeDevice } from "@/modules/attendance";
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  const { action } = await body(
    request,
    z.object({ action: z.enum(["pair", "revoke"]) }).strict(),
  );
  const token = action === "pair" ? await pairDevice() : "";
  if (action === "revoke") await revokeDevice();
  const response = json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 30 * 86400 : 0}${new URL(env().BETTER_AUTH_URL).protocol === "https:" ? "; Secure" : ""}`,
  );
  return response;
});
