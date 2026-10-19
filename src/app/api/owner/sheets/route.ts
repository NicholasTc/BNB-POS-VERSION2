import { z } from "zod";
import {
  endpoint,
  requireOwner,
  assertOrigin,
  body,
  json,
  limit,
} from "@/lib/http";
import { sheetsStatus, retrySheets } from "@/modules/sheets/status";
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await sheetsStatus());
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  await requireOwner(request);
  await body(request, z.object({ action: z.literal("retry") }).strict());
  await limit("owner:sheets-retry", 2, 60);
  await retrySheets();
  return json({ ok: true });
});
