import { endpoint, json } from "@/lib/http";
import { deviceToken } from "@/modules/attendance";
import { cashierPromos } from "@/modules/promos/server";
export const GET = endpoint(async (request) =>
  json(await cashierPromos(deviceToken(request))),
);
