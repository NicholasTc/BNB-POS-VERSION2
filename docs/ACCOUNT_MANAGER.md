# Developer account manager

Open `/admin` directly on the application's canonical URL. No owner/cashier navigation links lead to it. The login page contains no account records; every data endpoint requires a database-backed administrator role. URL concealment and noindex metadata are not authorization.

## Approved first version

- **Owners:** list existing owner names/emails and create a new owner with name/email/password. All owners share this deployment's single café: revenue, transactions, menu, inventory, staff and attendance. Language and alert-dismissal preferences remain per owner. This does not create separate businesses or copy any financial records.
- **Staff:** the same staff-management component, validation and attendance/PIN service are used in `/admin` and the owner dashboard. Create staff, reset PINs, update names and availability. PINs remain four digits, unique and hashed; old PINs are never displayed. Open-shift deactivation, cashier invalidation on PIN reset and duplicate-PIN rules are retained.
- **Boundaries:** administrator credentials cannot use the owner login/dashboard or authorize cashier PIN actions. Owner accounts cannot access admin functions or create other owners. Staff/device credentials grant neither owner nor admin privileges. Developer management does not imply owner impersonation.
- No administrator creation through the browser, public signup, web password reset, owner deletion/deactivation, backup download/restore or separate-business tenancy is included. Those require separately approved work. The existing original-owner recovery command remains available for the original owner only.

## Initial setup and recovery

Back up SQL, apply migrations, then run:

```sh
npm run db:migrate
python3 scripts/provision-admin.py
```

The helper prompts for email and a 12–128-character password through hidden terminal input, then sends structured stdin to `npm run admin:bootstrap`. No password is placed in shell arguments, environment files or repository files. Answer N for first creation. An existing administrator is never overwritten implicitly. For administrator recovery, rerun the helper and explicitly answer Y; only that administrator's previous sessions are revoked. Keep terminal/database access restricted. This command uses DATABASE_URL from the current environment (normally local .env.local); it is not a deployment command. Production provisioning must be performed deliberately inside the intended protected environment, never by reusing a local loopback database URL.

There is one reserved developer administrator (`admin`). Additional business partners are created as owners in the web page. The original `scripts/provision-owner.py` command targets only the original owner identity (`owner`), not an arbitrary partner account. It does not revoke partner/admin sessions. New-owner password recovery UI is not implemented in this version.

The supplied developer credentials were provisioned only in lisi_dev during this task. Credentials are deliberately omitted from this document. No Railway/production account was created.

## Security and failure behavior

- Reuses the existing Better Auth password hashing/cookie engine. Public routes still expose only allowed sign-in/sign-out/session operations. A role-specific login gate verifies the resulting SQL identity and revokes wrong-portal sessions before sending any session cookies.
- SQL reserves admin identity/role and enforces valid roles and case-insensitive email uniqueness. Roles are read from SQL on every privileged request; headers, submitted role/owner/café IDs, browser state and paired-device possession do not grant privileges. Strict account payloads cannot promote an owner to administrator.
- Sessions preserve the 15-minute idle and eight-hour absolute limits. Passive polling validates without extending idle time. Trusted interaction records activity at most once per minute. Expiry/revocation unmounts sensitive forms; focus/history restoration masks data until revalidated. Database/network failures hide protected content rather than claiming healthy access. Cashier handoff revokes this browser's privileged session; other personal-device sessions stay independent. Admin and owner logins share one cookie, so use separate browser profiles/contexts when testing both roles concurrently.
- Sign-in has separate admin/owner SQL-backed limits: 10 requests/minute and 10 failed reservations/15 minutes, plus the existing authentication-library throttling. Account creation requires the administrator password again, with five failed reservations/15 minutes. Success releases only its own reservation. Staff admin mutations are capped at 30/minute. HTTPS/HttpOnly/SameSite cookies, exact-origin writes, bounded JSON and no-store responses retain the existing protections. Password-only administrator login is the user's chosen initial scope; it does not provide MFA.
- Owner creation locks the administrator identity, current session and password record in the same transaction as user/credential/receipt/audit creation. Recovery/reset and account creation serialize. A stable operation UUID and keyed request fingerprint support explicit same-request retries after a lost response; no automatic credential-write retries occur. Reusing an operation with different account details is rejected. Refreshing the page loses the in-memory operation ID, but email uniqueness still prevents duplicate accounts; inspect the owner list before retrying.
- Credentials/PINs never enter application browser storage, business records or audit payloads. The owner-creation receipt contains only IDs and an HMAC fingerprint; the password record contains the salted password hash. Sensitive form state is kept in memory and cleared after success/logout/revocation. The only shared browser preference used here is display language.
- Existing business audit actions retain their prior conventions; admin owner creation records the administrator ID and created owner ID, and shared staff changes record the acting identity. This version adds no audit-history UI or comprehensive per-owner attribution rewrite for older modules.

## Migration and operational limits

Migration 0013 replaces the fixed single-owner CHECK with roles, retains the original owner as role=owner, adds a case-insensitive email index and adds only owner_creation receipt metadata. It does not change cashier device pairing, PIN credentials, sales, discounts, stock capture, attendance, images or spreadsheet rules. Apply the migration before starting the updated application. Old application versions only recognize the original owner, so reverting application code would hide partner access until the compatible version is restored; preserve the new schema/data and use a tested rollback plan.

Backups include SQL account/role/receipt metadata. Image binaries remain separately backed up as documented in MENU_PHOTOS.md. No production deployment, hosted access trial or physical Safari/iOS verification is claimed by local tests.
