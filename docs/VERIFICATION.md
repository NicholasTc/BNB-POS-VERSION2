# Verification record

Local verification on 2026-10-18 (Asia/Jakarta); this records an MVP, not certification for public production use.

## Implemented and tested

- Owner auth/provisioning/reset, blocked signup, server authorization, exact-Origin CSRF guards, bounded JSON bodies and sanitized operational logs.
- Owner-paired/revocable device; unique salted/peppered four-digit PINs, durable brute-force limits, concurrent-safe attendance, authenticated cashier switches, idle lock and credential revocation.
- Menu/employee management, touch cart and cashier-bound local cart recovery, cash/QRIS selection and explicit manual receipt attestation.
- Persisted immutable price/name/cashier snapshots; PostgreSQL state/aggregate constraints, atomic completion, durable idempotency, original-cashier recovery and no false success after failed responses.
- Date-filtered owner revenue/count/item/cashier/payment summaries, paginated itemized history and overlapping attendance, reconciled against known fixtures at Jakarta midnight boundaries.

## Actual final gate

Stage 1: 3 unit / 5 integration / 1 browser test passed. Stage 2: 6 / 14 / 2. Stage 3: 9 / 26 / 6. Stage 4: 13 / 31 / 7. Every stage also passed typecheck, zero-warning ESLint, migration checks and production build before advancing.

Stage 5 final sequential gate: **13 unit tests, 35 real PostgreSQL integration tests, 9 Playwright Chromium tests passed**; typecheck, zero-warning ESLint, migration drift check, production build and client-secret asset scan passed. Foundation integration reapplies the entire migration set twice safely.

Browser checks cover clock-in/switch/individual clock-out/final locking, refresh and fresh app process, complete cash/QRIS flow, explicit cart discard, stale-price rejection, lost payment/completion responses after commit, owner date filters/itemized reports, mobile checkout, keyboard focus containment/Escape, touch target size/no mobile page overflow, owner session revocation on handoff, and actual PostgreSQL TCP connection outage/recovery with exactly one persisted completed sale.

Backup/restore passed: 14 public/Drizzle tables, content digests, row counts, sequences and sale aggregate integrity matched in a disposable restored database, including a completed sale and attendance fixture. No user database was overwritten.

Local performance sample (1,000 completed-sale fixture, 10 measured samples): POS p95 4 ms, report p95 20 ms, combined quote/attest/complete p95 17 ms. These are local service timings, not a deployed-load or capacity guarantee; raw latest metrics are ignored at `.verification/performance.json`.

Dependency audit: runtime **0 vulnerabilities**. Full audit reports **5 high entries in one unpatched braces/Next ESLint development dependency chain**, with no critical/moderate entries after patched esbuild override. ESLint 9 remains for plugin peer compatibility despite EOL. Risk/mitigation are documented in RELIABILITY.md; do not treat the full audit as clean.

## Follow-up verification (2026-10-18)

The complete sequential `npm run gate` passed after the automatic-update/language changes: **16 unit, 40 real PostgreSQL integration and 13 Chromium browser tests**, typecheck, zero-warning lint, migration drift check, production build and browser-secret scan (13 assets). Backup/restore matched all **15 public/Drizzle tables**, content digests, row counts, sequences and completed-sale totals. Additive migration 0003 was applied locally; no financial or attendance transaction logic changed.

Four additional browser regressions cover owner menu/status changes without losing carts, checkout polling suspension and immutable saved quotes, automatic report updates with preserved draft/applied dates and expanded records, late-response rejection, stale-data recovery, pending-button feedback, and language persistence through reload/logout/fresh browser login. Five preference integration checks cover defaults, authorization/CSRF, strict validation, durable storage and passive reads that neither renew nor accept expired owner sessions. English dates retain Jakarta boundaries. English/Indonesian dashboard screenshots were visually inspected.

Latest local 1,000-sale / 10-sample timings: POS p95 3 ms, reporting p95 23 ms, quote/attest/complete p95 20 ms. Local measurements only. Existing audit findings and cross-browser/production verification limits above remain unchanged; dependencies were not changed in this follow-up.

## Reference cashier redesign verification (2026-10-18)

Final sequential `npm run gate` passed: **20 unit, 43 real PostgreSQL integration and 16 Chromium browser tests**, typecheck, zero-warning lint, no migration drift, production build, browser-secret scan (13 JS assets), and backup/restore of 15 public/Drizzle tables including completed sale/shift, matching digests/sequences/totals. Additive migration 0004 applied locally; existing development products/history preserved.

New checks exercise owner-authorized strict category/photo validation, neutral legacy defaults and metadata preservation, cash integer/keypad limits and Rp58.000 → Rp100.000 → Rp42.000 change, selected product badges, one Save waiting for authoritative completion, QRIS checkbox gating without premature attestation, close/reopen retaining the quote, live category/photo changes and local image fallback. Existing attendance, idempotency, immutable quotes, lost-response, database-outage, live-report and language regressions remain passing.

Inspected reference catalog/cash/QRIS captures at 630px plus mobile and desktop layouts. Owner dashboard styling is unchanged; new photo/category controls use the existing management form style. Seven generated local WebP placeholders and a code-native SVG logo replace unavailable original assets. See UI_REDESIGN.md and assets/PRODUCT_ARTWORK.md. No claim of original font/logo asset fidelity.

Latest local p95 (1,000 sales / 10 samples): POS 3 ms, reports 28 ms, quote/attest/complete 16 ms. Dependencies were not changed or re-audited for this redesign; previous audit and verification limits remain applicable.

## Cashier header refinement (2026-10-18)

Full sequential gate passed after matching the newest locked/active header reference: **20 unit / 43 PostgreSQL integration / 17 Chromium browser tests**, typecheck/lint, no migration drift, build, 13-asset browser-secret scan and 15-table backup/restore. New browser coverage checks bar/tab alignment, logo/control centering, identical bar height/position before/after PIN entry, existing-shift Masuk reauthentication without duplicate attendance, mobile overflow and long-name containment. Before/after/mobile screenshots visually reviewed at 784px/390px. No database, dependency or financial-domain change.

## Review and remaining verification limits

Security/integrity review checked every route's trust boundary, cookie/origin behavior, employee attribution and revocation, lock order, transactional state changes, immutable rows, money overflow, idempotency/payload mismatch and database failure handling. Default third-party auth SQL logging is disabled; custom logs do not include credentials or raw errors. Built browser assets were scanned for actual configured server secrets without exposing them.

Inspected tablet/mobile/dashboard screenshots; native PIN dialog adds explicit focus wrapping/restoration. No known critical application defects remain from this review. Source was formatted and checked for unnecessary modules/duplication; domain transactions stay in three focused modules.

Not fully verified: Safari/Firefox, real café hardware and staff training, screen-reader certification, adversarial penetration testing, deployed performance, real-data recovery objectives, production roles/TLS/monitoring/hosting. At initial MVP verification, no public deployment, real merchant integration, owner credentials or real café records were created. Subsequently, local development-only test accounts were provisioned at the user's request; see MANUAL_TESTING.md for their credentials and PROGRESS.md for the provisioning checks.

Deferred/excluded: features in SCOPE.md, including customer ordering, refunds/voids/edits, settlement, inventory/payroll/accounting, multi-branch and native apps. No empty future modules were added. No application implementation blockers remain; operational prerequisites are in OPERATIONS.md.
