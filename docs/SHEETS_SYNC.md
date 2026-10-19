# Google Sheets sales and attendance copy

## Current authorization

Testing only. All existing and future **local development** completed sales and attendance are included. Approved test spreadsheet: https://docs.google.com/spreadsheets/d/1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc/edit.

**Before production or later feature rollout: remind the owner to provide the separate live spreadsheet link.** Confirm its service-account Editor access and obtain production deployment authorization. No live link has been supplied. Never use the test spreadsheet for production café records.

## How it works

- PostgreSQL remains authoritative. Migration 0005 adds three module tables and transactional queue triggers. A completed sale and its export task commit together; clock-in/clock-out queue attendance in the same transaction. Historical records are backfilled. Switching/locking cashiers does not alter attendance or queue a new shift. Employee name edits requeue attendance; sales retain immutable historical names/prices.
- No Google request runs during a cashier action. Domain functions, financial states, idempotency/recovery and login policies remain unchanged. Like any atomic database write, failure of queue persistence rolls back the original operation rather than silently omitting its export. Google outages only delay background export.
- `npm run sheets:worker` runs independently of web pages, processes up to 25 records every 30 seconds and retries with bounded exponential backoff/jitter. Run one worker per database. A dedicated PostgreSQL session advisory lock prevents normal concurrent workers; no POS/device/employee locks are held during Google calls.
- Durable row reservations precede Google writes. Retrying an uncertain response writes the same cell ranges, rather than appending. Attendance clock-out updates the original shift row. Revision acknowledgment cannot mark a newer clock-out as exported by an older in-flight request. Daily reconciliation requeues previously synced records to repair missing/changed values and eventually converge after an ambiguous stale request or connection loss. This is not a claim of exactly-once network delivery.
- Destination binding prevents changing a database's configured spreadsheet/mode silently. Test mode accepts only the approved test ID and loopback `lisi_dev`/`lisi_test`. Live mode requires a different ID and explicit confirmation. A separate production database starts with its own binding and row map.
- Credentials are loaded only by the worker from a private file or server secret. Google receives only explicitly selected sales/item/attendance columns, never PINs, password hashes, owner sessions or database credentials. Values use RAW input to prevent formula injection; integer IDR amounts and Jakarta date serials remain numeric. No Drive API/admin role/domain-wide delegation is needed.

## Spreadsheet tabs

- **Sales:** sale UUID/reference, completion time (WIB), cashier ID/name, payment method, total IDR, item quantity, completed status.
- **Sale items:** line UUID, sale UUID/reference, menu ID/historical name, quantity, unit price and subtotal IDR.
- **Attendance:** shift UUID, employee ID/name, clock-in/out (WIB), completed shift hours, working/finished status. Open clock-out/hours stay blank.

The worker creates only these managed tabs and preserves unrelated tabs. Headers are frozen, fields readable and dates/money formatted. Do not insert/delete/reorder/sort rows or edit managed headers/IDs; use filter views or copy data to another tab for analysis. The worker detects conflicting row identities/headers and stops rather than overwriting unknown data. Missing values can be restored by daily reconciliation. This additional copy does not replace PostgreSQL backups, authentication records or disaster-recovery procedures.

## Local setup

Apply additive migration with `npm run db:migrate`. Keep the existing private key outside the repository. Add these **non-secret settings and file path** to private `.env.local`:

```dotenv
SHEETS_SYNC_MODE=test
SHEETS_SPREADSHEET_ID=1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc
GOOGLE_SERVICE_ACCOUNT_FILE=/Users/nicholaschan/Private/bnb-pos-sheets-key.json
```

Use `npm run sheets:worker -- --once` for one batch; keep `npm run sheets:worker` running for continuous local sync. A stopped laptop/worker cannot sync; pending jobs remain in PostgreSQL. Restart the worker after changing config. Stop it with Ctrl+C. Set `SHEETS_SYNC_MODE=off` and stop/restart the worker to disable exports; existing POS functions and queued records remain available.

Owner-only status is under **Pengaturan → Perangkat kasir → Cadangan spreadsheet**. It shows pending records, last success, stale-worker/error feedback and the live-link reminder. Retry only makes pending work eligible; the independent worker must be running. Background reads do not extend owner login. Secrets and raw Google error bodies are not returned by this API.

## Production later — not enabled

After the owner provides the live URL and authorizes deployment: apply migration, configure a separate worker using the same production database, set `SHEETS_SYNC_MODE=live`, its separate `SHEETS_SPREADSHEET_ID`, `SHEETS_LIVE_CONFIRMED=true`, and a server-only `GOOGLE_SERVICE_ACCOUNT_JSON` secret. Do not set both credential sources or any `NEXT_PUBLIC_` credential. Do not commit/upload the downloaded key into Git/build context. Keep worker enabled continuously; monitor pending age/errors and PostgreSQL backups. Never run test fixtures against production. Current work does not deploy or modify production.

## Sources and limits

Uses Google's [official Node authentication library](https://github.com/googleapis/google-cloud-node-core) and [Sheets batch value updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate). Bounded batches/backoff follow [Google's quotas guidance](https://developers.google.com/workspace/sheets/api/limits). Sheets has finite row/cell capacity; a full spreadsheet reports a delayed export and requires an explicitly planned archive/destination migration. Do not reset row maps against an existing populated destination. Restore the database and its sync metadata together.

Automated fixtures always use the guarded local `lisi_test` database and fake Google transport. The real API smoke check uses only the approved test spreadsheet and local development data; it is separate from regression fixtures.
