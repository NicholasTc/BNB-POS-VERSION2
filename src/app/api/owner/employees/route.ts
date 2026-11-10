import { endpoint, json, assertOrigin, requireOwner, body } from "@/lib/http";
import { saveEmployee } from "@/modules/attendance";
import { employeeInput, listEmployees } from "@/modules/staff-management";
export const GET = endpoint(async (request) => {
  await requireOwner(request);
  return json(await listEmployees());
});
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const owner = await requireOwner(request);
  await saveEmployee(await body(request, employeeInput), owner.id);
  return json({ ok: true });
});
