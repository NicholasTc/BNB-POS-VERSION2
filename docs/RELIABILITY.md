# Security and reliability

Implementation is staged; PROGRESS.md identifies actual verification. Policy: DECISIONS.md.

## Foundation

Better Auth owns owner password hashing/session cookies. Public signup and unused auth endpoints are blocked. One-owner database constraint, eight-hour database-verified sessions, explicit reset/logout revocation. State-changing endpoints require the exact configured Origin and JSON; no permissive CORS. Login throttling is atomic in PostgreSQL, independent of spoofable proxy headers. Credentials are provisioned through hidden local input, never bundled or logged. Configuration errors expose key names only; operational errors expose sanitized messages and structured event/path/kind logs.

Development PostgreSQL binds only to loopback. Test scripts validate the isolated `/lisi_test` URL before resetting fixtures. SQL migrations are versioned and explicitly applied; no runtime schema push. Use separate production database roles for migration and application access before deployment.

JSON bodies are bounded to 16 KiB while streaming, including owner authentication. Query/connection timeouts bound database failure waits; failed requests return sanitized errors without optimistic success. Third-party auth SQL logging is disabled; custom events contain only timestamp/path/status or safe error codes. Owner navigation back to cashier revokes owner access. Test runners and backup verification take an exclusive session advisory lock so fixture resets cannot overlap; the final gate runs them sequentially.

Dependency review: patched esbuild override removes the Drizzle tool's vulnerable nested esbuild. Runtime audit currently reports zero findings. The Next ESLint plugin depends on an unpatched braces stack-exhaustion advisory (GHSA-vfj7-8cjw-p6xm), reported as five high entries through its dependency chain; exposure is development linting of maliciously nested glob patterns, not request handling. Use trusted repository/config input only. No patched stable upstream braces release was available at review. ESLint 9 is pinned for plugin peer compatibility despite end-of-support; revisit the toolchain before production and on updates. Do not run automatic forced downgrades suggested by npm audit.

## Owner/cashier boundary hardening (2026-10-18)

Every owner data/management route derives the sole owner's identity from a database-verified session. A paired cashier browser, employee PIN, forged cookie/cache or supplied role/user header grants no owner access. Owner sign-in accepts only email/password; unused signup/reset/change-password endpoints remain closed. Cookies are HttpOnly, SameSite=Strict and Secure when the configured URL uses HTTPS. Auth responses and the owner page prohibit caching.

Sessions have an absolute eight-hour lifetime with library renewal disabled. Each owner route additionally enforces a 15-minute idle limit using the existing session updated_at timestamp. Passive background reads never touch it; genuine visible-page pointer/keyboard activity sends a touch at most once per minute, and interactive owner requests also count. Expiry deletes that session and requires password sign-in. Blurred/restored views are masked until revalidated, preserving drafts while authorized; a 401 unmounts private reports/forms. Cross-tab logout messages contain only an invalidation hint; server authorization remains authoritative.

Cashier entry first confirms durable owner logout, including direct URL/history entry. Inspection of installed Better Auth 1.7.10 found its sign-out handler suppresses database deletion failures; the app explicitly revokes the server-derived session before clearing cookies. Failed deletion blocks cashier handoff and offers retry. Logout revokes only that session; owner password reset revokes all owner sessions. A copied old cookie cannot restore a revoked session.

Owner login has global PostgreSQL budgets of 10 requests/minute and 10 failed/reserved attempts per 15-minute window. A success releases only its own reservation; previous failures persist across process restarts. These limits can temporarily block a correct password after repeated failures. Exact Origin/application/json checks guard writes; strict login schemas reject role, identity and expiry overrides.

Review references: [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [Better Auth session options](https://better-auth.com/docs/concepts/session-management), checked alongside installed library code. Password-only authentication was explicitly retained: someone with the owner password or an already-unlocked owner session can act as owner. Browser masking supplements server checks and physical device security. No penetration-test certification or deployed-browser guarantee is claimed.

## Required financial invariants

Integer rupiah; server-derived cashier identity; server-validated prices; immutable historical sale names/prices; positive quantities; transactionally written totals and lines; durable unique idempotency keys and payload verification. These deliver effectively-once persistence, not exactly-once network delivery. Never display success until persistence or status lookup confirms the completed record.

Uncertain transactions must retain their recovery key across refreshes. Employee sessions/cart changes must not silently erase this key. During outages, do not request a second customer payment. Follow WORKFLOWS.md and ask the owner to reconcile before replacement entry.

Implemented sale states: pending (saved quote), paid (cashier-attested, awaiting completion/recovery), completed (included in reports), cancelled (only when explicitly attested not yet paid). All quote/line fields are immutable; database triggers enforce allowed transitions and deferred aggregate checks require 1–50 lines matching the header total. Maximum quantity is 99 per product and maximum total Rp1,000,000,000; overflow/fractional amounts are rejected. Prices changed before quoting require a fresh cart; later menu changes do not alter issued quotes.

Device-row locking serializes attendance, quoting, attestation, completion and recovery. Repeated UUID/payload returns the saved result; a different payload is rejected. Finalization cannot attribute a sale to a browser-supplied employee. The original employee must reauthenticate if their cashier access expires. An already-completed response remains recoverable even after idle expiry. PIN reset and device pairing revoke active credentials without erasing unfinished sales or shifts.

## Automatic updates and owner language

Automatic updates use visible-page, read-only five-second polling, with focus/reconnect and best-effort cross-tab invalidation. Requests do not overlap; cleanup aborts outstanding work. Reports use applied-query/version guards to reject obsolete replies while retaining draft inputs and expanded records. Background failures retain prior data and show a quiet stale-data message. Cashier menu polling pauses during payment/recovery and never rewrites carts or immutable quotes. Status checks preserve the existing authorization, lock and attendance rules.

Background owner requests retain expiry/revocation checks without recording activity; cashier status reads never perform an activity touch. Report-specific failures retain their stale-data notice, but failed owner-access validation hides the private view until connectivity returns and access is checked. Cross-tab messages contain only an invalidation hint and cannot authorize requests or record sales. Owner language preferences use an owner-derived key, strict enum validation and the existing exact-Origin/JSON guards; the browser cache is presentation-only.

## Reference UI and menu metadata

Cashier styling is scoped to preserve the owner dashboard. Additive migration 0004 gives old menu records neutral category/photo defaults; legacy edits that omit metadata preserve it. Strict owner-authorized/origin-checked schemas validate category and bounded local-placeholder/HTTPS URLs. Images load directly in the browser without referrers or a server-side URL fetch; HTTPS image sources are permitted by CSP, with local fallback on errors. Cash calculations are bounded integer presentation helpers. Save retains the existing separate durable server transitions and recovery writes; closing a sheet never authorizes cancellation or a new sale.

## Before production

No public deployment is authorized. Require HTTPS, trusted reverse proxy configuration, secret management, least-privilege DB roles, tested backup/restore, monitoring, and a review of the final stage verification record. Four-digit PINs have a small keyspace: device authorization, salted hashing, a separate pepper, persistent throttling, prompt credential reset and physical device controls are necessary. PIN hashes and pepper must not share a backup destination.

See OPERATIONS.md for provisioning, exact recovery steps, backup/restore/revocation precautions and deployment prerequisites; VERIFICATION.md records actual tests, local measurements and verification limits.
