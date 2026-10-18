# LISI POS

Local café POS MVP with four-digit employee PINs, attendance, secure cashier switching, cash/QRIS recording, durable sale recovery, owner reporting and employee/menu management. Read [progress](docs/PROGRESS.md) and [verification](docs/VERIFICATION.md) for actual status. No public deployment or real café data is configured.

## Setup

Requires Node 22.12+ (22.x) or 24.x, npm, Python 3 for interactive provisioning, and Docker with Compose.

1. `npm ci`
2. Copy `.env.example` to `.env.local`; generate two independent secrets using `openssl rand -base64 48` for `BETTER_AUTH_SECRET` and `PIN_PEPPER`. Keep the file private and out of Git. Local PostgreSQL credentials in the example are exclusively for the loopback Compose databases.
3. `docker compose up -d --wait`
4. `npm run db:migrate`
5. `python3 scripts/provision-owner.py` (first owner, or explicit reset that revokes existing owner sessions).
6. `npm run dev`; open <http://127.0.0.1:3000>. Use this exact origin; cookies and CSRF checks depend on `BETTER_AUTH_URL`.

The local environment and databases have already been prepared in this checkout. At your request, a **local test owner and two active test employees** have been created; their development-only credentials are in [manual testing](docs/MANUAL_TESTING.md). For this checkout, skip owner provisioning and employee creation. Sign in at `/owner`, scroll to Pengaturan kafe, connect this device, and add menu names/final prices. Select Kasir to return; this signs out the owner. Leading-zero PINs work. A fresh database still requires the setup steps above. See [operations](docs/OPERATIONS.md) for resets and recovery.

The owner dashboard at `/owner` supports simultaneous sign-ins from personal browsers/devices without cashier pairing. Only the shared cashier browser needs **Connect this device**; owner sign-in on another browser does not replace it. Physical devices will use the same hosted HTTPS URL after deployment.

For a guided first test with sample employees, menu items and expected report totals, follow [manual testing](docs/MANUAL_TESTING.md).

Visible cashier listings/status and owner reports now check for changes every five seconds, with additional checks on focus/reconnection and cross-tab updates. Listing refresh pauses during payment and preserves existing carts and saved quotes. Owner reports retain filters and expanded details. The owner header's **Bahasa / Language** selector saves Indonesian/English to the owner account across sessions; cashier language, rupiah amounts and Jakarta business dates remain unchanged.

Cashier design follows the supplied reference: **Staf** contains attendance/lock/owner access, **Ubah** edits the cart, and **Tunai/QRIS** open payment sheets. One Save action acknowledges and completes the same transaction. Owner menu management now includes category and optional photo URL/placeholder fields; existing products and owner dashboard layout are preserved. See [UI mapping](docs/UI_REDESIGN.md) and [placeholder artwork](docs/assets/PRODUCT_ARTWORK.md).

Production-mode local verification: `npm run build && npm start`. No public deployment is configured or authorized. Never change localhost credentials into production credentials by reuse.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:integration` (real isolated `/lisi_test` PostgreSQL; database fixtures are destructive only there)
- `npm run build`
- `npx playwright install chromium` once, then `npm run test:e2e` (production-mode app on port 3100 and isolated test DB)
- `npm run check:secrets` checks the built browser assets for actual configured server secrets without printing their values.
- `npm run backup:dev` writes a private, ignored development database dump; `npm run backup:verify` restores a populated **test** backup into a uniquely named temporary database, compares all tables/sequences and sale totals, then removes only that temporary database.
- `npm run gate` runs typecheck, lint, unit/integration tests, migration drift check, build, client secret scan, browser tests, and test backup/restore in order.
- `npm run db:generate` generates SQL and snapshots after intentional Drizzle schema changes; review generated SQL before `npm run db:migrate`. Commit the entire `drizzle/` directory and package-lock.json.

Do not run integration and browser tests simultaneously: both use the isolated test database. A session-level PostgreSQL advisory lock also serializes the two runners and backup verification; a second runner waits up to 60 seconds. Never point TEST_DATABASE_URL at real data. No production secrets or real employees are seeded automatically.

## Troubleshooting

- Database unavailable: check `docker compose ps` and ports 55438/55439. Dev data uses a named volume; test data is ephemeral. Do not remove the dev volume as a troubleshooting shortcut.
- Invalid server configuration: fill all required environment keys; errors intentionally list keys without secret values.
- Login rejected: check the exact application origin and owner provisioning. Database-persisted attempt limits survive restarts; wait for the limit window instead of resetting the database.
- Port 3100 busy: stop the process you own; browser tests intentionally do not reuse an unknown server.
- Sandbox restrictions may require approval for the Docker socket, npm downloads, local listeners, and browser execution.

Architecture and policy: [decisions](docs/DECISIONS.md), [scope](SCOPE.md), [acceptance](docs/ACCEPTANCE.md), [reliability](docs/RELIABILITY.md), [workflows](docs/WORKFLOWS.md).

## Project layout

```text
src/app/          Next pages and authorized JSON route handlers
src/components/   Touch POS, PIN dialog, cart/recovery and owner UI
src/modules/      Attendance/device, transactional sales and reporting
src/lib/          Owner auth, credentials, HTTP guards, money/date/env helpers
src/db/           Drizzle schema and PostgreSQL pool
drizzle/          Versioned SQL migrations, financial triggers and snapshots
tests/            Vitest units/real-PostgreSQL integration and Playwright flows
scripts/          Migrations, hidden-input owner provisioning, backup/restore/secret checks
docs/             Policy, acceptance, operations, verification and progress checkpoint
```
