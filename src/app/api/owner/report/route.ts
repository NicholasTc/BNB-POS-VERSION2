import { z } from "zod";
import { endpoint, json, requireOwner, AppError } from "@/lib/http";
import { businessToday } from "@/lib/dates";
import { report } from "@/modules/reporting";
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  const q = new URL(request.url).searchParams;
  const page = z.coerce.number().int().min(1).max(100000);
  const result = z
    .object({
      from: z.string(),
      to: z.string(),
      salesPage: page,
      attendancePage: page,
    })
    .safeParse({
      from: q.get("from") ?? businessToday(),
      to: q.get("to") ?? businessToday(),
      salesPage: q.get("salesPage") ?? 1,
      attendancePage: q.get("attendancePage") ?? 1,
    });
  if (!result.success) throw new AppError(400, "Filter laporan tidak valid.");
  return json(await report(result.data));
});
