import { z } from "zod";
import { env } from "@/lib/env";
import { endpoint, assertOrigin, requireOwner, body, json } from "@/lib/http";
import { DEVICE_COOKIE, pairDevice, revokeDevice } from "@/modules/attendance";
import { DEVICE_TRUST_SECONDS } from "@/modules/device-trust/policy";
import { readDeviceTrust } from "@/modules/device-trust/server";
/** Owner role → read shared pairing presence/expiry only; no token exposure, renewal or personal-device pairing. */
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await readDeviceTrust());
});
/** Owner role + Origin/strict action → explicitly replace or revoke the one cashier pairing and set/clear the protected device cookie. */
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
    `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? DEVICE_TRUST_SECONDS : 0}${new URL(env().BETTER_AUTH_URL).protocol === "https:" ? "; Secure" : ""}`,
  );
  return response;
});
