import {
  endpoint,
  json,
  requireAdmin,
  assertOrigin,
  body,
  limit,
} from "@/lib/http";
import { saveEmployee } from "@/modules/attendance";
import { employeeInput, listEmployees } from "@/modules/staff-management";
/** Admin role → shared safe staff listing, excluding credential hashes. */
export const GET = endpoint(async (request) => {
  await requireAdmin(request);
  return json(await listEmployees());
});
/** Admin role + Origin/schema/throttle → existing staff/PIN service → success; no owner impersonation. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const admin = await requireAdmin(request);
  await limit("admin-staff:" + admin.id, 30, 60);
  await saveEmployee(await body(request, employeeInput), admin.id);
  return json({ ok: true });
});
