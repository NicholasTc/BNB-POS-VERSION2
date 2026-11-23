import {
  endpoint,
  json,
  assertOrigin,
  requireOwner,
  body,
  AppError,
} from "@/lib/http";
import { ownerAlerts } from "@/modules/alerts/server";
import { alertCommand } from "@/modules/alerts/types";
/** Owner role → reconcile only per-owner alert metadata from current business facts → feed; source records are not repaired. */
export const GET = endpoint(async (request) => {
  const owner = await requireOwner(request);
  if (new URL(request.url).search)
    throw new AppError(400, "Filter peringatan tidak valid.");
  return json(await ownerAlerts(owner.id));
});
/** Owner role + Origin/strict versioned targets → bounded alert metadata/audit action. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const owner = await requireOwner(request);
  return json(await ownerAlerts(owner.id, await body(request, alertCommand)));
});
