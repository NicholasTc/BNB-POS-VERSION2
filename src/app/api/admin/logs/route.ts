import { endpoint, requireAdmin, assertOrigin, body, json, AppError, limit } from "@/lib/http";
import { diagnosticQuery, diagnosticCommand, listDiagnostics, diagnosticDetail, diagnosticReport, resolveDiagnostic } from "@/modules/diagnostics/server";

/** Admin session → strict filters → diagnostic metadata only; exports are private and uncached. */
export const GET = endpoint(async request => {
  const admin = await requireAdmin(request);
  await limit("diagnostics:read:" + admin.id, 120, 60);
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => query.getAll(key).length !== 1)) throw new AppError(400, "Filter log tidak valid.");
  const parsed = diagnosticQuery.safeParse(Object.fromEntries(query));
  if (!parsed.success || (parsed.data.download && !parsed.data.id)) throw new AppError(400, "Filter log tidak valid.");
  if (parsed.data.id) {
    const detail = await diagnosticDetail(parsed.data.id);
    if (parsed.data.download) return new Response(JSON.stringify(diagnosticReport(detail), null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="lisi-diagnostic-${detail.issue.id}.json"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    return json(detail);
  }
  return json(await listDiagnostics(parsed.data));
});

/** Admin session → exact-origin strict resolve command → diagnostic state only. */
export const POST = endpoint(async request => {
  assertOrigin(request);
  const admin = await requireAdmin(request);
  await limit("diagnostics:resolve:" + admin.id, 30, 60);
  return json(await resolveDiagnostic(await body(request, diagnosticCommand)));
});
