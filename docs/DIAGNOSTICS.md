# Developer diagnostics

Open `/admin`, sign in as the developer administrator, then choose **System logs**. Owner and employee credentials cannot read, export or resolve these reports. The URL remains absent from owner/cashier navigation. Existing administrator idle/absolute expiry and reauthentication rules remain in force; passive log refresh does not extend idle time.

Choose a grouped issue to see a plain-English description of the observed failure, investigation steps, affected route/method, Jakarta timestamps, count, release and reference IDs. Expand Technical details for a recognized error code and bounded code locations. Filter by status/source/severity/period or an issue/occurrence UUID. Download exports only the selected sanitized issue and its last twenty retained occurrence samples. Mark resolved organizes the list; it neither fixes code nor deletes business data. A new occurrence reopens the issue; resolving an outdated revision returns a conflict.

## Collection and privacy

Server capture covers endpoint 5xx/unexpected exceptions, business-pool errors and Next server request/render failures. Browser capture covers uncaught error/rejection events, failed API/network reads and exhausted cashier loading recovery. Worker capture covers actual core Sheets/report failures, not idle backoff passes. Expected 4xx authentication/validation responses are not collected as operational incidents. This is not access auditing, session replay, analytics or a record of every console message.

Every event has a UUID, UTC timestamp, source, kind, severity, allowlisted route/method, commit identifier, optional recognized code and at most five code locations. Raw exception messages, SQL text, request/response bodies, query values, headers, cookies, passwords/PINs, employee/customer names and Google/storage credentials are excluded. Unknown values are discarded. The release value `local` means no valid commit hash was available; it does not prove which machine ran the process. Browser-reported locations/releases are untrusted observations and must be verified against server/platform evidence. A failed response is not proof that a sale was lost.

Browser ingestion requires an existing unexpired owner/admin session or valid paired-browser cookie, exact origin, strict bounded JSON and SQL-backed request limits (120/minute overall, 12/minute per reporter). Pairing permits submitting observations only, never reading logs or owner information. The client independently limits eight submissions/minute, two in flight and repeated symptoms within ten seconds. No input fields/storage are inspected. An offline/unpaired browser cannot reliably submit a report.

## Data flow and operational limits

Capture → sanitize → structured platform console event → bounded in-memory queue → separate one-connection pool → `diagnostic_issue` / `diagnostic_event`. Migration 0015 adds only these two tables, their indexes/checks and a diagnostic-to-diagnostic foreign key. Capture does not await persistence and never participates in a sale/attendance transaction. Viewing logs uses the normal authorized read path; diagnostics do not grant privileged access.

The queue holds at most 100 events; batches hold ten. Storage has short connection/query/lock deadlines, no retry storm and capacity limits of 100,000 occurrences/10,000 groups. Retention runs after server/worker startup, hourly and during writes. Samples expire after 30 days; inactive groups expire after 30 days without an occurrence. Active-group counts cover the group since first seen, not just the selected filter window. Capacity eviction can remove older entries earlier. Retention is best effort while a process/database is available, not a hard deletion-time guarantee during outages.

If SQL is unavailable, structured console events remain the fallback and the admin page explicitly reports that logs cannot be loaded. Abrupt process termination, queue overflow, a database outage or browser offline state can lose dashboard events. Use Railway service logs for startup/build failures, complete database outages and independent correlation. This feature is neither an external uptime monitor nor a complete financial/database backup.

`DIAGNOSTICS_ENABLED=false` stops server collection/persistence without changing authorization or business actions. Apply consistently to web/worker and rebuild/redeploy the web if browser capture must also stop at its layout configuration. Already stored reports remain readable. No public development fault route or real transaction replay is provided.

## Local checks and deployment boundary

Automated tests inject synthetic events only into the validated loopback test database. They verify redaction, grouping/deduplication, resolve/reopen races, authorization, strict ingestion limits, unavailable-store isolation, retention, report download and responsive admin UI. Run `npm run gate` for full regression. Never inject test errors into live payments.

For local use, apply pending migrations to the intended local database after backup. A future hosted release must apply migration 0015 before expecting persistent logs, and deploy the compatible web and worker code to collect both sources. Existing production versions do not acquire this UI or these hooks automatically. No production migration/deployment was performed for this change.

## Maintenance comments

The database/server documentation pass covers 210 named functions across 85 source/script files, including API authorization, transitions, projection/export, stock, authentication and operational helpers. `src/db/schema.ts` maps all table purposes and the sixteen existing SQL trigger functions to their data flow. Historical migrations and live SQL functions were not rewritten. The pass was checked by comparing TypeScript-printed source with comments removed against its pre-comment baseline: no executable changes. This equivalence check applies to the documentation pass, not the separately authorized logging/reminder implementation.
