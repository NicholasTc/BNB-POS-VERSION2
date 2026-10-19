# Google Sheets sales and attendance copy

## Current authorization

Two distinct destinations are approved and pinned in the server configuration:

- **Local/manual testing:** https://docs.google.com/spreadsheets/d/1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc/edit
- **Production deployment:** https://docs.google.com/spreadsheets/d/1Pmv5xiEUWUmG1VnI1dRkqDZoP96APAgPsVLYYRvh_GU/edit

The owner supplied the live link on 2026-10-19; do not ask for it again. Local .env.local keeps test mode/the test destination. Automated fixtures keep Sheets off and never upload fixture data. Service-account metadata read and a same-title write request succeeded on 2026-10-19; no cell, sales or attendance data was changed. Selecting the live destination does not itself start a Railway worker or deploy the app. Never run a local backfill against the live spreadsheet or copy test row maps into production.

## How it works

- PostgreSQL remains authoritative. Migration 0005 adds three module tables and transactional queue triggers. A completed sale and its export task commit together; clock-in/clock-out queue attendance in the same transaction. Historical records are backfilled. Switching/locking cashiers does not alter attendance or queue a new shift. Employee name edits requeue attendance; sales retain immutable historical names/prices.
- No Google request runs during a cashier action. Domain functions, financial states, idempotency/recovery and login policies remain unchanged. Like any atomic database write, failure of queue persistence rolls back the original operation rather than silently omitting its export. Google outages only delay background export.
- `npm run sheets:worker` runs independently of web pages, processes up to 25 records every 30 seconds and retries with bounded exponential backoff/jitter. Run one worker per database. A dedicated PostgreSQL session advisory lock prevents normal concurrent workers; no POS/device/employee locks are held during Google calls.
- Durable row reservations precede Google writes. Retrying an uncertain response writes the same cell ranges, rather than appending. Attendance clock-out updates the original shift row. Revision acknowledgment cannot mark a newer clock-out as exported by an older in-flight request. Daily reconciliation requeues previously synced records to repair missing/changed values and eventually converge after an ambiguous stale request or connection loss. This is not a claim of exactly-once network delivery.
- Destination binding prevents changing a database's configured spreadsheet/mode silently. Test mode accepts only the approved test ID and loopback `lisi_dev`/`lisi_test`. Live mode accepts only the approved LIVE ID with explicit confirmation, rejects common loopback/local host aliases and local dev/test database names, and requires the production database. Database URLs must state an explicit host; host query overrides and encoded local sockets are rejected so the PostgreSQL client's target cannot bypass the URL guard. Invalid database URL schemes are rejected safely. A separate production database starts with its own binding and row map.
- Credentials are loaded only by the worker from a private file or server secret. Google receives only explicitly selected sales/item/attendance columns, never PINs, password hashes, owner sessions or database credentials. Values use RAW input to prevent formula injection; integer IDR amounts and Jakarta date serials remain numeric. No Drive API/admin role/domain-wide delegation is needed.

## Spreadsheet tabs

- **Sales:** one row per completed transaction: sale UUID/reference, completion time (WIB), cashier ID/name, payment method, numeric total IDR, numeric item quantity, completed status and **Rincian item (IDR)**. The final cell lists every historical item with quantity, unit price and subtotal, one item per line (for example `Juice A ×2 @ Rp20.000 = Rp40.000`). Wrapped text and calculated row heights keep the details readable beside the cashier. The total is recorded once per transaction.
- **Attendance:** shift UUID, employee ID/name, clock-in/out (WIB), completed shift hours, working/finished status. Open clock-out/hours stay blank.

The worker creates only Sales and Attendance and preserves unrelated tabs (including Sheet1). Migration 0006 requeues existing sales once without changing their source data or reserved rows. The exact original nine-column Sales header is upgraded by appending the item-details column; other customized headers stop safely. After a successful combined-sales write, a recognized old Sale items tab is hidden, preserving its cells and database row reservations for recovery. It is an archived snapshot and is no longer updated; use Sales for current item details. New spreadsheets never create a Sale items tab. Headers are frozen, fields readable and dates/money formatted. Do not insert/delete/reorder/sort rows or edit managed headers/IDs; use filter views or copy data to another tab for analysis. The worker detects conflicting row identities/headers and stops rather than overwriting unknown data. Missing values can be restored by daily reconciliation. This additional copy does not replace PostgreSQL backups, authentication records or disaster-recovery procedures.

## Local setup

Stop the old worker, apply migrations (including 0006) with `npm run db:migrate`, then restart the worker. Do not run old/new worker versions against the same spreadsheet during the upgrade. Keep the existing private key outside the repository. Add these **non-secret settings and file path** to private `.env.local`:

```dotenv
SHEETS_SYNC_MODE=test
SHEETS_SPREADSHEET_ID=1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc
GOOGLE_SERVICE_ACCOUNT_FILE=/Users/nicholaschan/Private/bnb-pos-sheets-key.json
```

Use `npm run sheets:worker -- --once` for one batch; keep `npm run sheets:worker` running for continuous local sync. A stopped laptop/worker cannot sync; pending jobs remain in PostgreSQL. Restart the worker after changing config. Stop it with Ctrl+C. Set `SHEETS_SYNC_MODE=off` and stop/restart the worker to disable exports; existing POS functions and queued records remain available.

Owner-only status is under **Pengaturan → Perangkat kasir → Cadangan spreadsheet**. It shows pending records, last success, stale-worker/error feedback and a reminder that production activation is still required when not in live mode. Retry only makes pending work eligible; the independent worker must be running. Background reads do not extend owner login. Secrets and raw Google error bodies are not returned by this API.

## Production activation — destination selected, not deployed by this task

The approved non-secret worker settings are in [deploy/sheets.production.env.example](../deploy/sheets.production.env.example). In Railway, create a separate worker service from the tested repository revision, in the same production environment as the existing app/Postgres. Use `npm run sheets:worker` as its start command; do not change the web app start command. Keep `RAILPACK_PRUNE_DEPS=false` because the pinned worker launcher tsx is a development dependency ([Railpack Node configuration](https://railpack.com/languages/node/#config-variables)).

Apply the existing database migrations before starting the matching worker. Configure the worker (and web app, for accurate owner status) with:

```dotenv
SHEETS_SYNC_MODE=live
SHEETS_SPREADSHEET_ID=1Pmv5xiEUWUmG1VnI1dRkqDZoP96APAgPsVLYYRvh_GU
SHEETS_LIVE_CONFIRMED=true
```

Reference the existing production DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET and PIN_PEPPER; the current shared DB initialization requires these core app variables. Add GOOGLE_SERVICE_ACCOUNT_JSON as a private server-only Railway variable. These secrets are not included in the template. Keep all local .env.local values on their existing local/test settings; adding the live link does not change the local database or destination. Do not set both credential sources or any `NEXT_PUBLIC_` credential. Do not commit/upload the downloaded key into Git/build context. Keep worker enabled continuously; monitor pending age/errors and PostgreSQL backups. Never run test fixtures against production. This task does not deploy code, configure Railway variables/services, upload any sales/attendance to the live sheet, or modify the production database. The live destination is ready to configure; active production syncing still requires the worker and server variables above.

## Sources and limits

Uses Google's [official Node authentication library](https://github.com/googleapis/google-cloud-node-core) and [Sheets batch value updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate). Bounded batches/backoff follow [Google's quotas guidance](https://developers.google.com/workspace/sheets/api/limits). Sheets has finite row/cell capacity; a full spreadsheet reports a delayed export and requires an explicitly planned archive/destination migration. Do not reset row maps against an existing populated destination. Restore the database and its sync metadata together.

Automated fixtures always use the guarded local `lisi_test` database and fake Google transport. The real API smoke check uses only the approved test spreadsheet and local development data; it is separate from regression fixtures.
