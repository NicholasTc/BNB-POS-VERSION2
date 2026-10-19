# LISI POS progress checkpoint

Updated: 2026-10-19 (Asia/Jakarta).

## Current stage
Combined spreadsheet Sales layout complete and verified locally/test only. **One row per transaction** retains its cashier, date/time, payment, numeric total/quantity and all immutable item names, quantities, unit prices and subtotals in a wrapped details cell. Attendance stays separate. Migration 0006 requeues historical sales without changing source data or row positions. Recognized legacy Sale items is hidden after a successful combined write; cells/maps remain intact. New destinations create only Sales and Attendance. No production changes or deployment.

**Persistent reminder for future feature sessions:** obtain the owner's separate LIVE spreadsheet URL, confirm service-account Editor access and production authorization before enabling live Sheets sync. No live link is supplied yet. Keep production export off. Approved test spreadsheet ID: `1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc`.

## Completed work
- Optional Sheets module: migrations 0005/0006, transactional queue/backfill, stable row reservations, independent 30-second worker, bounded retry/backoff, clock-out revisions, daily reconciliation, destination/environment guards and owner-only status/retry. Module guide: SHEETS_SYNC.md. Google requests never run in cashier transactions; credentials/PINs/sessions never export.
- Cashier startup fix: bounded 10-second reads/idempotent logout (at most three attempts), coalesced/cancelled loads, stale-response protection and saved-cart restoration. Initial failures retry automatically; checkout stays blocked until authoritative recovery is known. No automatic financial writes.
- Existing MVP: secure four-digit employee PINs; one owner-paired cashier browser; durable attendance, cash/QRIS checkout/recovery; live listing/report refresh; bilingual responsive owner dashboard. Maps: UI_REDESIGN.md / OWNER_UI.md.
- Owner password-only access from concurrent personal devices is independent of pairing. Idle 15 minutes, absolute eight hours; cashier handoff requires verified owner logout. Prior authorized live owner/Alicia setup exists; never record credentials.
- Private local .env.local selects test mode; credential file remains ~/Private/bnb-pos-sheets-key.json outside Git, mode 600. Downloaded credential filenames, env files and worker logs are ignored. No key contents in repository.

## Latest verification
- Final sequential npm run gate after the row-height correction: **38 unit / 63 real PostgreSQL integration / 33 Chromium browser tests (134 total) passed**. Typecheck, zero-warning lint, no schema drift, production build, browser-secret scan (13 JS assets), and 18-table backup/restore with matching contents/sequences/totals passed.
- Real Google check: **8 local completed sales / 6 attendance records**, all exported cells reconcile to PostgreSQL, including combined historical item details. Unique sale IDs, pending 0, repeated run processed 0. Source sale/line/attendance digests unchanged; legacy details hidden/preserved. Migration 0006 applied locally to dev/test only. Saved wrapping, width and expanded multi-item row heights verified through the API. Native browser visual review unavailable.
- Regression coverage includes same-row historical upgrade, multiple immutable items, known/custom header handling, preserved legacy maps, RAW formula-safe input, lost replies/no duplicates, concurrent workers, disabled/destination guards, clock-out races, Google failures, owner-only API boundaries and existing payment/attendance/security behavior. Full details: VERIFICATION.md.
- Previous runtime audit: zero vulnerabilities; five high development-only entries remain documented in RELIABILITY.md. No dependencies changed for combined layout or startup fixes.

## Next action
Review the test spreadsheet's **Sales** tab, especially **Rincian item (IDR)**, and try a new local sale or clock-in/out. Continuous local test worker is running in managed terminal session **69534**; it must remain open. After reboot/session loss, run `npm run sheets:worker` in a terminal and leave it open. No daemon or production worker installed. Restart the worker after code/config changes. Obtain LIVE link/authorization before production Sheets rollout.

The live app is https://bnb-pos.up.railway.app (Railway zealous-peace / production / BNB-POS-VERSION2); neither this Sheets change nor the local startup fix was deployed here. Preserve the earlier uncommitted startup work in pos.tsx, sales.tsx and its helper/tests.

## Resume rules / limits
- Run regression sequentially. Fixtures only target guarded loopback lisi_test with Sheets off/fake transport. Real API checks use approved test sheet plus lisi_dev. Never run fixtures against café data.
- Stop old workers, apply migrations (including 0006), then restart the new worker in other environments. Do not run old/new layouts together. Restore database and sync metadata together. Never reset row maps against a populated destination.
- Managed headers/IDs/rows must not be moved/sorted/edited; use filter views or analysis copies. Unknown headers/IDs stop safely. Legacy detail archive is no longer updated; current items are in Sales. Sheet1/unrelated tabs are preserved.
- PostgreSQL remains authoritative; keep full backups. Google outages delay exports; queue-write failures roll back their originating transaction rather than silently losing the export. Sheets is not a database disaster-recovery replacement or an exactly-once network guarantee.
- No live spreadsheet or production deployment/configuration authorized. Physical-device/other-browser/hosted-worker trials remain separate work. Preserve unrelated user edits.
