import { endpoint, json, assertOrigin, requireOwner, body } from "@/lib/http";
import { saveEmployee } from "@/modules/attendance";
import { employeeInput, listEmployees } from "@/modules/staff-management";
/** Owner role → safe shared employee metadata without PIN material. */
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await listEmployees());
});
/** Owner role + Origin/strict input → existing staff/PIN transaction with active-shift protections. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const owner = await requireOwner(request);
  await saveEmployee(await body(request, employeeInput), owner.id);
  return json({ ok: true });
});
