# LISI POS progress checkpoint

Updated: 2026-10-18 (Asia/Jakarta).

## Current stage
Owner/cashier authentication hardening complete and locally verified. User-approved password-only sign-in and 15-minute owner inactivity lock; 2FA deferred. Absolute eight-hour expiry, database-confirmed logout before cashier entry, persistent failure budgets and removal of unauthorized owner views implemented. No deployment or schema/dependency changes.

Owner multi-device access confirmed: dashboard login is independent of cashier pairing and supports concurrent personal-browser sessions. Settings copy clarified in Indonesian/English; concurrent reporting, independent logout and uninterrupted cashier access verified.

Cashier top-section refinement complete and verified against the newest reference: logo/Staf row above a compact locked/active status bar and aligned category tabs. Locked and active bar geometry stays stable. Owner dashboard layout retained; menu photo/category fields added. No deployment. Full implementation/function mapping: UI_REDESIGN.md; current use: MANUAL_TESTING.md; verification history/limits: VERIFICATION.md.

## Completed work
- All owner read/write routes reject anonymous, paired-cashier, employee and forged identities. Owner sessions are DB-verified; passive updates do not count as activity. Blur/history revalidation preserves authorized drafts, while expiry/revocation unmounts private views. Direct cashier navigation revokes that browser's owner session; failed logout blocks handoff and supports retry. Independent personal-owner sessions remain available.
- Complete MVP: PostgreSQL/Drizzle, owner authentication, four-digit employee PINs, shared-device authorization, persistent attendance, cashier switching/locking, immutable cash/QRIS sales and durable recovery, owner reporting/management.
- Safe read-only five-second visible-page updates for cashier listings/status and owner reports; carts/quotes/filter drafts retained. Passive reads do not renew owner/cashier access. Owner Indonesian/English preference persists across sessions.
- User-approved final-two-image redesign: green logo, compact photo catalog/category tabs/quantity badges, Staf controls/attendance, compact order summary with Ubah editing, cash keypad/received/change sheet and QRIS merchant-confirmation sheet. Seven local generated photo placeholders; artwork prompts/paths in assets/PRODUCT_ARTWORK.md.
- One Save action acknowledges and completes the same quote through existing idempotent server transitions; recovery is persisted before each request. Closing a sheet only hides it; explicit unpaid cancellation is under Rincian transaksi. Existing financial snapshots/authorization/recovery remain enforced.
- Additive migration 0004 applied to local development/test databases. Old products retained with neutral metadata defaults; omitted metadata in legacy edits remains intact. Only menu metadata domain code changed; no financial transaction/schema changes or dependency updates.

## Latest verification
- Full sequential `npm run gate`: **20/20 unit**, **56/56 real PostgreSQL integration**, **22/22 Chromium browser**; typecheck, zero-warning lint, no migration drift, production build and browser-secret scan (13 JS assets) passed.
- Backup/restore: 15 public/Drizzle tables, content/row digests, sequences and sale totals matched, including a completed sale/shift. Fixtures target only guarded loopback lisi_test; development records untouched except additive migration.
- New security coverage: every owner-route trust boundary, copied-cookie replay, idle/absolute expiry, failed database revocation, persistent throttling, strict login/origin/media-type checks, browser history/cross-tab revocation and safe handoff retry. Runtime dependency audit re-run: 0 vulnerabilities. Full development-tool audit not re-run; prior findings below remain.
- Regressions include same-reference lost payment/completion replies and actual database outage, checkout refresh suspension, live reports/filter drafts, language persistence, metadata validation/preservation, cash boundaries/change, QRIS gating, sheet close/reopen and cart editing. Mobile/630px reference/desktop screenshots inspected; latest header checks at 784px and 390px cover aligned widths, unchanged locked/active height/position, long names and PIN unlock without duplicate shifts. Two fresh owner browser contexts (laptop/tablet viewport sizes) accessed owner/report APIs with no device cookie, both received a cashier sale, and one owner logout left the other owner and cashier active. Local review artifacts: test-results/header-{before,after,mobile}.png and reference-{catalog,cash,qris}.png.
- Local 1,000-sale / 10-sample p95: POS 3 ms, report 29 ms, quote/attest/complete 16 ms. Local measurements only. No blockers.

## Next action
Reload the app and follow MANUAL_TESTING.md, including Owner security checks. Use separate owner/cashier browser profiles and simulated payments. Verify owner sign-in is required after idle lock/direct cashier navigation, while independent personal-device sessions and cashier sales continue working. Existing products remain under Semua until assigned categories/photos.

## Resume notes / limits
- Apply versioned migrations explicitly in other environments. Keep local credentials in the existing manual guide/private .env.local; never print/commit environment secrets or backups. Preserve unrelated user/generated changes.
- Full gate must run sequentially; integration/browser/backup runners share an advisory lock and must never target development/café records.
- Latest runtime dependency audit: 0 findings. Prior full audit: 5 high entries in a development-only braces/Next ESLint chain, plus compatible ESLint 9 EOL; full audit not re-run in this dependency-unchanged follow-up. See RELIABILITY.md.
- Chromium/local testing only. Production hosting/TLS/roles/off-host backup/monitoring, physical multi-device trials, other browsers and assistive-technology certification remain operational verification work. See OPERATIONS.md. Never deploy without explicit authorization.
