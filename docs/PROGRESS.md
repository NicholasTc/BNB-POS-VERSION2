# LISI POS progress checkpoint

Updated: 2026-10-18 (Asia/Jakarta).

## Current stage
Follow-up improvements complete and locally verified: safe cashier listing/status refresh, automatic owner report updates, subtle button feedback, and persistent owner Indonesian/English preference. No deployment. Existing carts, immutable quotes, payment recovery, filters, authorization and local test accounts preserved.

## Completed work
- Strict Next.js/React/Tailwind modular monolith; PostgreSQL/Drizzle migrations and isolated Docker development/test databases.
- Better Auth owner authentication/provisioning/reset, server authorization, origin/body guards, durable throttles and sanitized logs.
- Revocable shared device, four-digit salted/peppered PINs, concurrent-safe persistent attendance, secure switching, individual clock-out and idle/final locking.
- Employee/menu management, cashier-bound cart, cash/QRIS attestation, immutable quotes and sales, atomic idempotent completion and uncertain-response recovery.
- Date-filtered owner summaries and paginated itemized sales/attendance; Jakarta boundaries and report reconciliation.
- Mobile/keyboard usability review, real database outage recovery, client-secret scan, local performance and backup/restore verification. Documentation matches implementation; see README.md for structure/setup and OPERATIONS.md for provisioning/recovery/prerequisites.

## Original MVP verification
- Clean npm ci, typecheck, zero-warning ESLint, no migration drift and production build: passed. Migrations reapplied twice in integration tests.
- Vitest: **13/13 unit**, **35/35 real PostgreSQL integration**; Playwright: **9/9 Chromium**, including lost committed responses, refresh/fresh process, mobile/keyboard, owner revocation and actual PostgreSQL connection outage.
- Built browser-secret scan: passed (13 JS assets). Restored test backup matched **14 tables**, row/content digests, sequences and sale totals, including a completed sale and shift; disposable restore DB removed. Private development dump created under ignored backups/.
- 1,000-sale fixture / 10 samples: POS p95 4 ms; reporting p95 20 ms; quote+attest+complete p95 17 ms (local only).
- Runtime audit: **0 findings**. Full audit: **5 high entries in one unpatched development-only braces/Next ESLint chain**, plus plugin-compatible ESLint 9 EOL. Risk and mitigation documented; do not claim full audit clean. No known critical application defect remains from local review.

## Follow-up implementation / verification
- Read-only visible-page polling every 5 seconds with focus/reconnect and cross-tab invalidation; cashier menu refresh pauses during checkout, only updates the listing, and preserves carts/quotes/recovery. Device/cashier status is revalidated independently.
- Owner reports retain applied dates/pages, draft inputs and expanded records; version/abort guards reject late obsolete responses. Quiet stale-data feedback on background failure.
- Pressed states and explicit working labels; owner UI translated to Indonesian/English. Owner-authorized preference endpoint and additive migration 0003 persist language on the account, with browser cache for subsequent login screens.
- Full sequential `npm run gate` passed: typecheck, zero-warning lint, **16/16 unit**, **40/40 real PostgreSQL integration**, **13/13 Chromium browser**, no migration drift, production build, browser-secret scan (13 assets), backup/restore (15 tables, digests/sequences/sale totals matched). Four new browser regressions cover cart/quote preservation, live reports, stale/late responses and durable language; passive owner reads do not renew sessions. Dashboard screenshots inspected.
- Additive migration 0003 applied to local development/test databases. No dependency or financial/attendance domain changes. Latest local p95: POS 3 ms, reports 23 ms, quote/attest/complete 20 ms (1,000-sale fixture / 10 samples). Manual testing, policy and verification docs updated. No blockers.

## Next action
Reload the app once to load the new UI, then follow MANUAL_TESTING.md's automatic-update/language checks with separate owner/cashier browser profiles. Preserve local test credentials and unrelated generated next-env.d.ts changes; never run fixtures on development data. Apply versioned migrations explicitly when moving to another environment.

## Resume notes / limits
- Use `npm run gate` for regression after changes. Test runners and backup verification hold a shared advisory lock; never bypass loopback /lisi_test URL guards.
- Docker/npm/local network/browser execution may require sandbox escalation. Preserve generated ignored .env.local (mode 0600); never print/commit secrets or backups. No tests against real data.
- Browser coverage is Chromium only; deployed performance, production roles/TLS/monitoring, real-data disaster recovery, penetration testing and assistive-technology certification remain operational verification limits. See SCOPE.md for deliberately excluded features.
