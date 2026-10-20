# LISI POS progress checkpoint

Updated: 2026-10-20 (Asia/Jakarta).

## Current stage
Owner stock module **complete locally**. Pengaturan → Stok: whole-unit supplies, per-product usage, deliveries, physical adjustments with reasons, low/negative warnings and paginated immutable history. New quotes snapshot recipes; completed sales deduct once atomically. Negative stock is allowed. Owner-only UUID receipts protect duplicate deliveries/lost responses; revisions prevent stale counts/recipe overwrites. Cashier UI/payment actions, prices/promos, reports, preparation, attendance and Sheets unchanged. No new dependency/service. See STOCK.md.

## Verification / next action
Final sequential gate passed **48 unit / 90 integration / 45 browser = 183 tests**, typecheck/lint, schema drift/build/13-asset secret scan and **29-table backup/restore**. Additional populated-stock restore/ledger reconciliation passed; disposable fixtures cleaned. Reviewed phone/desktop stock, usage, history and adjustment captures. Migration 0009 freshly verified on guarded lisi_test and applied to local lisi_dev after backup `backups/lisi-2026-10-20T06-48-14-130Z.dump`; **all ten existing business source tables unchanged**. Build-generated next-env.d.ts changes restored; final whitespace check clean. No production deployment/commit/push.

Next: manual local acceptance: owner → Pengaturan → Stok → add cups/fruit packs → Pemakaian per menu (1 cup + 1 pack per serving) → cashier completes one normal payment → check balances/history. Use Tambah stok for deliveries and Sesuaikan stok for a reasoned physical count. Production later needs migration 0009 with matching application deployment; stock defaults empty/unconfigured and never backfills old sales. Physical Safari/hosted trials remain separate checks.

## Preserved completed work
- Owner promos (migration 0008), immutable sequential discounts, frozen recovery amounts, reconciled reports and existing Sheets export. Details: PROMOS.md.
- Desktop cashier restructuring applies only >=1280px + hover/fine pointer; phone/tablet unchanged. Existing owner navigation, language, drafts and cashier preparation/session features preserved.
- Migration 0008 previously applied to local dev/test after backup; eight source tables unchanged. Local TEST Sheets worker was session 12432; heartbeat must be checked before claiming it is running.

## Persistent context
- Completed baseline: secure owner-only password access (15-minute idle, eight-hour absolute), separate owner personal devices/shared cashier pairing, four-digit PINs, attendance/switching, safe menu/report auto-updates, durable UUID payment recovery, responsive bilingual owner UI, preparation queue and work sessions (migration 0007). Details: DECISIONS.md, WORKFLOWS.md, RELIABILITY.md, VERIFICATION.md.
- Approved [TEST sheet](https://docs.google.com/spreadsheets/d/1Dw6Cu-t3zTSfG70-rVuuSuMXBl9IvQf5tOXVNDum1Sc/edit) is for local/manual testing. Approved [LIVE sheet](https://docs.google.com/spreadsheets/d/1Pmv5xiEUWUmG1VnI1dRkqDZoP96APAgPsVLYYRvh_GU/edit) is for production. **Both links supplied; do not ask again.** Server config pins modes/IDs and rejects live export from local/dev/test databases. Local .env.local remains TEST.
- Service-account key stays outside Git at ~/Private/bnb-pos-sheets-key.json; credential filenames, env files, backups and verification scripts are ignored. Never display secrets or credentials.
- Production live Sheet metadata/same-title write access was previously verified, but hosted worker delivery is unverified. No Railway configuration/services/deployments changed. Production settings: deploy/sheets.production.env.example and docs/SHEETS_SYNC.md. Live app https://bnb-pos.up.railway.app was not changed here.
- Preserve unrelated edits. Fixtures only use guarded loopback test DB; local migration checks may read café data without resetting it. No automatic financial write retries, quote repricing, sale edits/refunds or exactly-once-network claims. Physical Safari/multi-device and hosted trials remain separate checks.
