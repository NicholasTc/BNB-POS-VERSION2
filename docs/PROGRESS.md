# LISI POS progress checkpoint

Updated: 2026-10-18 (Asia/Jakarta).

## Current stage
Cashier top-section refinement complete and verified against the newest reference: logo/Staf row above a compact locked/active status bar and aligned category tabs. Locked and active bar geometry stays stable. Owner dashboard layout retained; menu photo/category fields added. No deployment. Full implementation/function mapping: UI_REDESIGN.md; current use: MANUAL_TESTING.md; verification history/limits: VERIFICATION.md.

## Completed work
- Complete MVP: PostgreSQL/Drizzle, owner authentication, four-digit employee PINs, shared-device authorization, persistent attendance, cashier switching/locking, immutable cash/QRIS sales and durable recovery, owner reporting/management.
- Safe read-only five-second visible-page updates for cashier listings/status and owner reports; carts/quotes/filter drafts retained. Passive reads do not renew owner/cashier access. Owner Indonesian/English preference persists across sessions.
- User-approved final-two-image redesign: green logo, compact photo catalog/category tabs/quantity badges, Staf controls/attendance, compact order summary with Ubah editing, cash keypad/received/change sheet and QRIS merchant-confirmation sheet. Seven local generated photo placeholders; artwork prompts/paths in assets/PRODUCT_ARTWORK.md.
- One Save action acknowledges and completes the same quote through existing idempotent server transitions; recovery is persisted before each request. Closing a sheet only hides it; explicit unpaid cancellation is under Rincian transaksi. Existing financial snapshots/authorization/recovery remain enforced.
- Additive migration 0004 applied to local development/test databases. Old products retained with neutral metadata defaults; omitted metadata in legacy edits remains intact. Only menu metadata domain code changed; no financial transaction/schema changes or dependency updates.

## Latest verification
- Full sequential `npm run gate`: **20/20 unit**, **43/43 real PostgreSQL integration**, **17/17 Chromium browser**; typecheck, zero-warning lint, no migration drift, production build and browser-secret scan (13 JS assets) passed.
- Backup/restore: 15 public/Drizzle tables, content/row digests, sequences and sale totals matched, including a completed sale/shift. Fixtures target only guarded loopback lisi_test; development records untouched except additive migration.
- Regressions include same-reference lost payment/completion replies and actual database outage, checkout refresh suspension, live reports/filter drafts, language persistence, metadata validation/preservation, cash boundaries/change, QRIS gating, sheet close/reopen and cart editing. Mobile/630px reference/desktop screenshots inspected; latest header checks at 784px and 390px cover aligned widths, unchanged locked/active height/position, long names and PIN unlock without duplicate shifts. Local review artifacts: test-results/header-{before,after,mobile}.png and reference-{catalog,cash,qris}.png.
- Local 1,000-sale / 10-sample p95: POS 3 ms, report 28 ms, quote/attest/complete 16 ms. Local measurements only. No blockers.

## Next action
Reload the app and follow MANUAL_TESTING.md. Existing products remain under Semua until the owner assigns Minuman/Makanan and optional photos. Use Masuk on the locked status bar for first clock-in or existing-shift reauthentication; Staf retains attendance/lock/owner/manual refresh. Ubah edits cart quantities. Test with simulated payments and separate owner/cashier browser profiles.

## Resume notes / limits
- Apply versioned migrations explicitly in other environments. Keep local credentials in the existing manual guide/private .env.local; never print/commit environment secrets or backups. Preserve unrelated user/generated changes.
- Full gate must run sequentially; integration/browser/backup runners share an advisory lock and must never target development/café records.
- Prior dependency audit: runtime 0 findings; full audit 5 high entries in an unpatched development-only braces/Next ESLint chain, plus compatible ESLint 9 EOL. Not re-audited in this dependency-unchanged redesign; see RELIABILITY.md.
- Chromium/local testing only. Production hosting/TLS/roles/off-host backup/monitoring, physical multi-device trials, other browsers and assistive-technology certification remain operational verification work. See OPERATIONS.md. Never deploy without explicit authorization.
