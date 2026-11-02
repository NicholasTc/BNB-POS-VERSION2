# LISI POS progress checkpoint

Updated: 2026-11-02 (Asia/Jakarta).

## Current stage
Owner alert module **complete locally**. Authenticated toolbar bell → Perlu perhatian: grouped uncategorized menu, low/negative stock, spreadsheet problems and overdue pending/paid transactions. Persistent informational clear, one-hour nonurgent snooze, urgent acknowledgment, Hidden/restore and version-safe clear-all. Source fixes resolve automatically on observation. Bilingual, phone/tablet/desktop theme retained. Minimal owner mount/settings-navigation wiring; business command/calculation/worker modules unchanged. Migration 0010 adds one bounded alert metadata table and a partial stock movement lookup index. No new dependency/service. See ALERTS.md.

## Verification / next action
Final sequential gate passed **53 unit / 100 integration / 49 browser = 202 tests**, typecheck/lint, schema drift/build/13-asset secret scan and **30-table backup/restore**. Additional populated dismissal/snooze and 500-supply/10,000-movement restore passed; disposable supplemental fixtures cleaned. Local alert read p95 **3.29 ms** over 12 samples (not hosted capacity). Phone 320/390px and desktop 1440px captures reviewed. Migration 0010 verified fresh on lisi_test, then applied to lisi_dev after backup `backups/lisi-2026-11-02T09-48-08-833Z.dump`; **all sixteen existing business/stock source tables unchanged**. Build-generated next-env.d.ts restored; whitespace check clean. No production deployment/commit/push.

Next: manual local review: refresh owner dashboard → bell → clear category reminder → Hidden → restore → Atur kategori opens the existing menu editor. Low stock supports one-hour snooze; urgent negative/paid/sync errors stay visible after acknowledgment. Payment grace periods are 15 minutes pending / 2 minutes paid; intentional Sheets off is ignored. Long-shift alerts remain excluded until an agreed threshold. Production needs migration 0010 with matching app code; physical Safari/hosted rollout remains unverified.

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
