# Release readiness audit — 18 November 2026

Verdict: **Hold client launch sign-off.** This is a source review and local regression audit with limited unauthenticated live HTTP checks, not a penetration test or deployed-system certification.

## Exact scope

Folder: `/Users/nicholaschan/Desktop/Programming/BNB-POS-VERSION2`.
Origin: `https://github.com/NicholasTc/BNB-POS-VERSION2.git`.
Branch/commit: `main` / `747a2d688001ccceee7fc042add95b04abda88e0`, matching the user screenshot. The account manager, image-upload, alerts and daily-report additions exist on local `feat-final-push`; their implementation was not regression-tested in this audit. No branches were switched/merged. Production revision remains unverified.

## Verified results

- Typecheck and zero-warning lint passed after regenerating stale Next route types left from another branch. The initial typecheck failure referenced routes absent from this checkout; regeneration resolved it without application edits.
- 48 unit tests and 90 real PostgreSQL integration tests passed. Initially the test database was unavailable; starting only Compose test-db enabled the guarded suite. No café database fixtures were run.
- Schema generation reported no drift.
- Next compiled and generated production artifacts, then exited 1 with SecurityFatalError. **The production build/full gate failed.** This must not be represented as a passing gate.
- Separately, 13 browser JS assets passed the configured secret scan, 45 Chromium tests passed against generated production artifacts, and a 29-table isolated restore passed row/content/sequence, sale-total and stock-ledger/usage reconciliation. Total functional tests: 183.
- Browser coverage includes transient startup failures/timeouts, owner logout enforcement, expiry/revocation, employee isolation, cash/QRIS, immutable promos, committed-response loss, duplicate prevention, database outage recovery, attendance, preparation, inventory and responsive layouts. It does not establish that the intermittent development-server restart spinner is fixed.

## Findings and launch actions

1. **Security release blocker:** `npm audit --omit=dev --json` reports 6 affected entries: five high and one moderate. Next 16.4.2 is affected by the listed cache advisories; audit suggests 16.4.6. No `use cache`/`unstable_cache` usage was found in app source, so the cited information-disclosure conditions were not demonstrated here. Upgrade/review the intended release and rerun the entire gate.
2. **Dependency packaging:** `npm ls --omit=dev` retains Vitest/Vite/picomatch through Better Auth's optional Vitest peer. Five high entries are related dependency propagation, not five demonstrated remote attacks. Picomatch 4.0.7 is affected by a glob-pattern ReDoS advisory; no application import of the affected glob tools was found. Review production packaging/reachability; avoid blind force-fix/downgrade commands. No dependency changes were made.
3. **Release scope:** main lacks newer features present on feat-final-push. User was asked which version is intended for launch. Audit and deploy the exact agreed revision with matching migrations, rather than treating results from main as coverage of another branch.
4. **Operational sign-off remains open:** production migration level, owner/admin account provisioning, database least-privilege settings, managed backup retention and an actual production backup restore, production Sheets worker and live destination delivery, photo storage configuration if included, and trial on client hardware are unverified. Local restore success does not establish production recovery readiness. Review credentials previously shared for setup before handover.
5. **Startup follow-up:** the reported intermittent spinner after `npm run dev` restart remains unproven. Prior probes recovered; fresh browser tests confirm bounded transient recovery, not every development restart race. Preserve automatic reconnect requirements and server authorization; do not label this a proven production failure or fixed issue.

## Live HTTP observations

Read-only unauthenticated requests to `https://bnb-pos.up.railway.app`: `/` and `/owner` returned 200; `/admin` returned 404; `/api/owner` and `/api/owner/report` returned 401 with no-store. `/owner` had no-store headers. HSTS was absent on checked successful responses. These checks verify limited availability/access denial only; they do not verify authenticated sales, deployed commit, database state or backup delivery. No login, financial action or deployment was performed.

## References and evidence

- [Next cache advisory](https://github.com/advisories/GHSA-mfr8-8qww-v76h)
- [Second Next cache advisory](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8)
- [Picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- Ephemeral local command evidence: `/tmp/lisi-final-gate.log`, `/tmp/lisi-runtime-audit.json`; test traces/results are ignored generated artifacts. No production secrets are included in this document.

Next action: confirm intended branch, remediate dependencies on that release, rerun a clean complete gate, then perform an authorized staging/client-device trial and verify production recovery/worker settings before sign-off. No automatic launch or merge was performed.
