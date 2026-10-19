# LISI POS progress checkpoint

Updated: 2026-10-19 (Asia/Jakarta).

## Current stage
Optional Google Sheets sales/attendance copy is implemented and verified **locally/test only**. All historical local development completed sales and attendance were copied to the approved test spreadsheet; future local records are queued automatically. No production connection, app deployment, push or live export was performed.

**Persistent reminder for future feature sessions:** obtain the owner's separate LIVE spreadsheet URL, confirm service-account Editor access and production authorization before enabling live Sheets sync. No live link is supplied yet. Keep production export off. Test spreadsheet ID: `1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc`.

## Completed work
- Sheets module: additive migration 0005 with transactional queue/backfill and stable row maps; independent 30-second worker; bounded retry/backoff, clock-out revisions, daily reconciliation, destination/environment guards and owner-only status/retry. Module guide: SHEETS_SYNC.md. No attendance/sales domain functions or cashier/checkout UI changed.
- Test tabs: Sales, Sale items, Attendance. Completed sales retain immutable names/prices; open/closed attendance updates the same shift row. Credentials, PINs and owner sessions never export. Only the worker loads credentials; Google requests never run in cashier transactions.
- Local migration applied to lisi_dev and guarded lisi_test. Private .env.local selects test mode; credential file remains ~/Private/bnb-pos-sheets-key.json outside Git with mode 600. Credential filenames, environment files and worker logs ignored. No credential contents recorded in repository.
- Existing MVP remains complete: secure four-digit employee PINs, one owner-paired cashier browser, durable attendance, cash/QRIS sales/recovery, live listing/report refresh, bilingual owner dashboard and responsive navigation. Cashier login refinements retain original shift/owner authorization. Maps: UI_REDESIGN.md and OWNER_UI.md.
- Live app already exists at https://bnb-pos.up.railway.app (Railway zealous-peace / production / BNB-POS-VERSION2). Prior user-authorized owner and Alicia account setup verified. Never repeat credentials in documentation. Owner dashboard supports concurrent personal devices; cashier pairing remains separate. Password-only owner login, idle 15 minutes, absolute eight hours; cashier handoff requires confirmed owner logout.

## Latest verification
- Final sequential npm run gate: **29 unit / 62 PostgreSQL integration / 29 Chromium browser tests passed**. Typecheck, zero-warning lint, no schema drift, default production build, client-secret scan (13 JS assets) and backup/restore (18 public/Drizzle tables with matching contents, sequences and totals) passed.
- Real Google API test: credential access HTTP 200; backfill copied **7 completed local sales / 12 sale-item rows / 5 attendance records**. Counts, totals, unique IDs and open-shift blanks match local PostgreSQL; pending 0. A repeated worker run processed 0 records. No live café database accessed.
- Tests cover atomic capture/rollback, historical backfill, immutable snapshots, lost applied replies without duplicate rows, concurrent workers, destination changes, disabled mode, permission/network backoff, in-flight clock-out revisions and owner-only API boundaries. Existing payment uncertainty/outage/recovery, attendance and owner security workflows remain green. Mobile owner sync UI inspected.
- Runtime npm audit: **0 vulnerabilities** after adding pinned google-auth-library 11.3.1. Full audit still reports five high development-only entries; see RELIABILITY.md. Existing native rolldown optional binding was restored from its exact cached tarball after npm pruned it; original optional lock entries and all existing dependency versions retained.

## Next action
Review the test spreadsheet and try a new local sale / clock-in / clock-out. Owner status: Pengaturan → Perangkat kasir → Cadangan spreadsheet. Continuous local worker is running in managed terminal session **7422**; it must remain running. If stopped or after reboot, start `npm run sheets:worker` in a terminal and leave it open. No startup daemon or production worker installed. Remind owner for LIVE link before any production Sheets rollout.

## Resume rules / limits
- Full regression is sequential; integration/browser/backup fixtures only target guarded loopback lisi_test. Never run fixtures against local development/café records. Automated tests force Sheets off and use fake transport; real API smoke uses only the approved test sheet and lisi_dev.
- Migration 0005 must be applied explicitly in other environments. Keep database and sync metadata together on restore. Managed tabs are generated copies: do not move/sort/edit rows, headers or IDs; use filter views/copied analysis tabs. Conflicts stop export safely; Sheets capacity/archive changes need explicit planning.
- PostgreSQL remains authoritative; keep full backups. Google outages delay exports; queue persistence is part of the same SQL transaction and a queue-write failure rolls back rather than silently losing its export. This is not exactly-once network delivery or a replacement for database disaster recovery.
- No live spreadsheet, production credentials/configuration, deployment or real external payment integration is authorized by this task. Physical device, other-browser, off-host restore and hosted-worker operational trials remain separate work. Preserve unrelated user edits.
