import { endpoint, json, requireOwner } from "@/lib/http";
export const GET = endpoint(async (request) => {
  const owner = await requireOwner(request);
  return json({ name: owner.name });
});
