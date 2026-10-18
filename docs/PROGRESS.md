# LISI POS progress checkpoint

Updated: 2026-10-18 (Asia/Jakarta).

## Current stage
**MVP implementation complete; all five local stage gates passed.** No deployment or real financial operations activated. Approved policy: unique four-digit PINs; all other initial defaults accepted. Read DECISIONS.md and VERIFICATION.md before changes.

## Completed work
- Strict Next.js/React/Tailwind modular monolith; PostgreSQL/Drizzle migrations and isolated Docker development/test databases.
- Better Auth owner authentication/provisioning/reset, server authorization, origin/body guards, durable throttles and sanitized logs.
- Revocable shared device, four-digit salted/peppered PINs, concurrent-safe persistent attendance, secure switching, individual clock-out and idle/final locking.
- Employee/menu management, cashier-bound cart, cash/QRIS attestation, immutable quotes and sales, atomic idempotent completion and uncertain-response recovery.
- Date-filtered owner summaries and paginated itemized sales/attendance; Jakarta boundaries and report reconciliation.
- Mobile/keyboard usability review, real database outage recovery, client-secret scan, local performance and backup/restore verification. Documentation matches implementation; see README.md for structure/setup and OPERATIONS.md for provisioning/recovery/prerequisites.

## Actual final verification
- Clean npm ci, typecheck, zero-warning ESLint, no migration drift and production build: passed. Migrations reapplied twice in integration tests.
- Vitest: **13/13 unit**, **35/35 real PostgreSQL integration**; Playwright: **9/9 Chromium**, including lost committed responses, refresh/fresh process, mobile/keyboard, owner revocation and actual PostgreSQL connection outage.
- Built browser-secret scan: passed (13 JS assets). Restored test backup matched **14 tables**, row/content digests, sequences and sale totals, including a completed sale and shift; disposable restore DB removed. Private development dump created under ignored backups/.
- 1,000-sale fixture / 10 samples: POS p95 4 ms; reporting p95 20 ms; quote+attest+complete p95 17 ms (local only).
- Runtime audit: **0 findings**. Full audit: **5 high entries in one unpatched development-only braces/Next ESLint chain**, plus plugin-compatible ESLint 9 EOL. Risk and mitigation documented; do not claim full audit clean. No known critical application defect remains from local review.

## Next action
Local manual-test owner (`owner@lisi.test`) and active employees Ayu/Bima were created on 2026-10-18 at the user's explicit request. Their development-only password/PINs are recorded in MANUAL_TESTING.md as requested; do not reuse for production. Owner HTTP login/authorization/logout and both employee PIN hashes verified. No attendance, menu or sales records created by provisioning. Sign in at http://127.0.0.1:3000/owner, connect the shared device, add the three sample menu items and follow the manual walkthrough.

Existing LISI dev server was confirmed on port 3000 and both databases healthy. Human café/device trial and production prerequisites remain before deployment authorization. Preserve the existing next-env.d.ts modification. Application regression results above are unchanged; this update provisioned local data and documentation only.

## Resume notes / limits
- Use `npm run gate` for regression after changes. Test runners and backup verification hold a shared advisory lock; never bypass loopback /lisi_test URL guards.
- Docker/npm/local network/browser execution may require sandbox escalation. Preserve generated ignored .env.local (mode 0600); never print/commit secrets or backups. No tests against real data.
- Browser coverage is Chromium only; deployed performance, production roles/TLS/monitoring, real-data disaster recovery, penetration testing and assistive-technology certification remain operational verification limits. See SCOPE.md for deliberately excluded features.
