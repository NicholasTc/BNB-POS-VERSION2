# Local operation and production prerequisites

## Start and provision

Follow README.md. Local app: `npm run dev` at http://127.0.0.1:3000. Production-mode local check: `npm run build && npm start`. Docker databases are isolated to loopback; real data is never seeded. Keep `.env.local` mode 0600 and out of Git.

Run `python3 scripts/provision-owner.py` to bootstrap the one owner or explicitly reset their email/password and revoke existing owner sessions. Password entry is hidden and never becomes a shell argument. No email reset or public signup endpoint exists.

The owner may sign in at `/owner` from any personal device, with multiple sessions open at the same time. Dashboard access does not require connecting that device; all sessions read the same server database. Only the cashier browser needs pairing. On an owner’s personal browser, leave Connect this device alone unless intentionally replacing the cashier terminal. Logging out signs out that session; password reset still revokes owner sessions globally. Local loopback hosting remains accessible only on its host computer; use the shared hosted HTTPS URL after deployment.

At `/owner`, use Pengaturan kafe on the actual cashier browser to connect the shared POS, create employee names and unique **four-digit** PINs, and enter final menu prices. Deliver PINs privately. Reset PINs through Ubah karyawan; existing hashes cannot be viewed. A reset clears that employee's cashier access but keeps their shift and unfinished transaction. Employees must finish their shift before being deactivated. Menu items are made unavailable rather than deleted; historical sale lines remain unchanged.

Returning through Kasir signs the owner out. Owner session maximum lifetime is eight hours with database verification. Device pairing lasts 30 days and can be explicitly revoked/replaced. Device re-pairing does not delete attendance or unresolved payments. Do not leave an owner dashboard unlocked in employee hands.

## Café recovery

- Idle lock (15 minutes) preserves shifts. Use Staf → Ganti kasir with a clocked-in employee's PIN. During unfinished payment, only the original cashier may reauthenticate.
- Global PIN budget: 60 attempts/minute; 10 failed/reserved attempts in a 15-minute window. Successful verification releases only its own failure reservation. Earlier failures are retained; limits survive restarts. Ten failures can temporarily lock out correct PINs too. Wait for the window, investigate physical access, and reset compromised PINs as owner.
- A cart is stored locally and bound to its cashier. Confirm discard before switching or ending cashier work. Never use another cashier's cart without checking it.
- Before receiving money, save/check the server quote. Menu changes before that step require refreshing the cart; issued quotes retain their prices until explicitly cancelled before payment.
- If payment was received but the response is uncertain, **do not charge again or create a replacement**. Retain the displayed LS-UUID reference and use Periksa status transaksi in the sheet or Staf → Perbarui & periksa. The browser preserves the key before sending requests; the server also retains the single unfinished transaction. An uncertain payment cannot be cancelled from the recovery screen.
- If service remains unavailable, preserve the reference and payment evidence for the owner. After service returns, owner checks unfinished transactions/history; the original employee authenticates and finishes the existing paid transaction. A completed result is recoverable even if cashier access expired. Never clear browser transaction storage as a troubleshooting shortcut.
- Owner reports distinguish unfinished paid records from completed revenue and are gross cashier-recorded amounts. QRIS is not independently verified. Corrections/refunds happen outside this MVP and do not rewrite recorded sales.

## Backup and restore

`npm run backup:dev` writes `backups/lisi-<UTC timestamp>.dump` with private file permissions. This is a PostgreSQL custom-format dump, not an encrypted/off-host backup. Store encrypted off-computer copies with restricted access; keep PIN_PEPPER and other secrets in a separate protected secret store. Check exit status; never use an incomplete dump.

`npm run backup:verify` uses only Compose `test-db` at port 55439. It takes the test-runner lock, dumps the test DB, creates a new random `lisi_restore_check_<suffix>` database, restores it transactionally, compares every public/Drizzle table's row count and content digest plus sequence values, checks sale totals, and removes its own temporary database. It never overwrites the development database. Run after browser tests to verify a fixture containing a completed sale and attendance.

For a real restore, first stop application writes and restore into a **new empty database** with PostgreSQL `pg_restore --single-transaction --no-owner --no-acl`. Compare counts, financial totals, schema/migration version and representative records before choosing it as the application database. Never restore over a running café database. Revoke restored owner sessions, revoke/re-pair device access, and review PIN resets/revocations made since the backup before reopening access. Reconcile payments recorded externally after the recovery point; an older backup cannot prove those payments absent.

Do not rotate PIN_PEPPER in place: existing keyed lookups would cease to work. Preserve the original secret for restoration and plan an owner-led reset of all employee PINs when rotating it. Owner auth-secret rotation invalidates signed cookies. Local fixture verification does not replace a host-specific disaster-recovery exercise.

## Before any production deployment

Public deployment remains unauthorized. Complete these prerequisites with explicit deployment authorization:

- HTTPS reverse proxy with trusted host/origin, transport security, request/body timeouts, process supervision and a private PostgreSQL network/TLS. Configure the exact external BETTER_AUTH_URL; do not reuse local Compose credentials.
- Separate least-privilege application and migration DB roles; application role must not own/alter schema or disable integrity triggers. Compose superusers are local tooling only.
- Fresh managed secrets, a real owner bootstrap, employee provisioning, verified menu prices and physical access controls for the shared device.
- Encrypted off-host backups, retention, recovery-point objectives, verified restore/reconciliation procedures and secret recovery. Keep test URLs and destructive fixtures away from production.
- Monitor sanitized `request_failed`, `owner_auth_unavailable`, `database_pool_error` events, PostgreSQL availability, failed PIN attempts and unfinished paid transactions. Synchronize server time and retain business timezone Asia/Jakarta.
- Review the documented ESLint/braces development-tool advisory and EOL plugin-compatible ESLint version; refresh security audit before release. Runtime audit is currently clear. CSP allows inline Next bootstrap scripts; review nonce-based CSP for the deployment environment.
- Staff trial on the actual tablet/browser, accessibility checks with real assistive technology, and a deployment-specific capacity/security review. Local automated checks alone do not establish production readiness.

## Deliberate limits

One shared device, no offline sales or customer ordering, cash/QRIS attestation only, no gateway settlement/refund/void/edit workflow. Quantity 1–99, 1–50 product types and total at most Rp1 billion per sale. Report windows at most 366 days with separate sales/attendance pagination. No printing, inventory, payroll or accounting integrations. See SCOPE.md for other exclusions.
