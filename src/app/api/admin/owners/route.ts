import { z } from "zod";
import {
  endpoint,
  json,
  requireAdmin,
  assertOrigin,
  body,
  AppError,
} from "@/lib/http";
import { createOwner, listOwners } from "@/modules/account-manager/server";
import { newOwnerInput } from "@/modules/account-manager/types";
/** Admin role → strict pagination → safe shared-cafe owner metadata. */
export const GET = endpoint(async (request) => {
  await requireAdmin(request);
  const query = new URL(request.url).searchParams;
  if (
    [...query.keys()].some((key) => key !== "page") ||
    query.getAll("page").length > 1
  )
    throw new AppError(400, "Halaman tidak valid.");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .safeParse(query.get("page") ?? 1);
  if (!page.success) throw new AppError(400, "Halaman tidak valid.");
  return json(await listOwners(page.data));
});
/** Admin role + Origin/strict input → fresh administrator password and idempotent owner creation transaction. */
export const POST = endpoint(async (request) => {
  assertOrigin(request);
  const admin = await requireAdmin(request);
  return json(await createOwner(admin, await body(request, newOwnerInput)));
});
