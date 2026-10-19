import { z } from "zod";
import { endpoint, json, assertOrigin, body } from "@/lib/http";
import { attendanceAction, deviceToken, posState } from "@/modules/attendance";
export const GET = endpoint(async (request) =>
  json(await posState(deviceToken(request))),
);
const schema = z
  .object({
    action: z.enum(["clock-in", "switch", "clock-out", "lock", "touch"]),
    pin: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .strict();
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const input = await body(request, schema);
  const farewell = await attendanceAction(
    deviceToken(request),
    input.action,
    input.pin,
  );
  return json({ ok: true, farewell: farewell ?? null });
});
