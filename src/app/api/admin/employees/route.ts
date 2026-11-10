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
export const GET = endpoint(async (request) => {
  await requireAdmin(request);
  return json(await listEmployees());
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const admin = await requireAdmin(request);
  await limit("admin-staff:" + admin.id, 30, 60);
  await saveEmployee(await body(request, employeeInput), admin.id);
  return json({ ok: true });
});
