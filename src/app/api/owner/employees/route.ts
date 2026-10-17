import { z } from "zod";
import { db } from "@/db";
import { employee } from "@/db/schema";
import { endpoint, json, assertOrigin, requireOwner, body } from "@/lib/http";
import { saveEmployee } from "@/modules/attendance";
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(
    await db
      .select({ id: employee.id, name: employee.name, active: employee.active })
      .from(employee)
      .orderBy(employee.createdAt),
  );
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  const input = await body(
    request,
    z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(80),
        pin: z
          .string()
          .regex(/^\d{4}$/)
          .optional(),
        active: z.boolean(),
      })
      .strict(),
  );
  await saveEmployee(input);
  return json({ ok: true });
});
