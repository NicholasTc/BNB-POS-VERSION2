import { endpoint, assertOrigin, body, json } from "@/lib/http";
import { browserDiagnostic, ingestBrowserDiagnostic } from "@/modules/diagnostics/server";

/** Paired/privileged browser → strict allowlisted report → separate diagnostic queue. */
export const POST = endpoint(async request => {
  assertOrigin(request);
  await ingestBrowserDiagnostic(request, await body(request, browserDiagnostic));
  return json({ accepted: true }, 202);
});
