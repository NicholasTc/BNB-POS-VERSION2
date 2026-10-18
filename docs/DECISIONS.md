# Decisions

## Owner navigation follow-up (2026-10-18)

- User explicitly requested the supplied phone/iPad/laptop owner reference as inspiration to reduce scrolling, preserving every existing capability. This supersedes the earlier owner-layout freeze. Four destinations: Ringkasan, Transaksi, Staf, Pengaturan; desktop/tablet sidebar and phone bottom navigation.
- Summary previews supplement full reports: all product aggregates remain available, full itemized transaction history and independent pagination remain under Transaksi/Staf, and all management fields remain accessible. Today/yesterday/seven-day shortcuts supplement the existing Jakarta custom date range. Preserve drafts, applied filters, pages and expanded sales across section/language/live updates. Shared cashier, API, financial, database and authentication rules remain unchanged. Mapping: OWNER_UI.md.

## Approved reference redesign (2026-10-18)

- Follow the final two user images for the cashier catalog/order summary and cash/QRIS sheets. Keep owner dashboard layout/styling unchanged; only add the requested menu metadata fields. Use matching temporary product photography and a green editable LISI mark.
- Staf contains attendance, switch/lock, owner navigation and manual refresh. Ubah exposes cart quantity/removal controls. Categories are owner-managed Minuman/Makanan; existing products stay uncategorized under Semua until the owner edits them. Images accept bundled placeholders or HTTPS URLs; failed images use a local fallback.
- One explicit Save action acknowledges receipt and then completes the same quote through the existing idempotent pending → paid → completed transitions. Persist recovery before each request. The QRIS checkbox alone is a local verification choice; cash received/change are bounded integer UI helpers, not settlement or separate financial records.
- Closing a sheet only hides it; the saved transaction still blocks a replacement sale. Unpaid cancellation stays explicit under Rincian transaksi. Lost responses require same-reference recovery, never another payment.

## Approved follow-up (2026-10-18)

- Refresh visible cashier listings/status and owner reports with read-only five-second polling plus focus/reconnect and best-effort cross-tab signals. Signals carry no records or credentials and never replace server authorization.
- Pause cashier menu refresh during payment/recovery. Preserve unpaid carts, saved quotes, historical prices, report filters/pages, unsubmitted inputs and expanded records. Abort/version guards prevent obsolete responses from replacing newer queries; background failures retain data with quiet stale feedback.
- Passive owner reads validate session expiry/revocation without renewing the login. Passive cashier reads do not extend the inactivity timer.
- Use subtle pressed states and working labels for feedback. Save Indonesian/English on the authenticated owner account, with a browser cache for the login screen. Keep cashier language, integer rupiah and Jakarta business dates unchanged.

## Approved business policy (2026-10-17)

- One café and one owner-authorized shared POS browser. The owner dashboard is intended for any personal device with a browser (tablet/laptop/desktop), with concurrent authenticated sessions and no cashier pairing requirement. Connecting/replacing a cashier browser does not limit owner dashboard access. One email/password owner account, locally bootstrapped/reset; no public signup or email-reset flow.
- Unique **four-digit numeric employee PINs** (user amendment). Owner provisions/resets credentials. Employee PIN required for clock-in, incoming cashier switch, and own clock-out.
- Cashier locks after 15 minutes of inactivity; attendance remains open until explicit clock-out. Active cashier clock-out requires another active employee to authenticate; final clock-out locks the POS.
- Explicitly confirm discard of unpaid carts before changing cashier. Do not clear or switch an uncertain sale until durable recovery resolves it.
- Cash and QRIS only, cashier-attested receipt of payment. Integer rupiah, positive whole quantities, final menu prices; no additional tax, charges, discounts, or tips.
- Asia/Jakarta business timezone. Sales reported by completion date; attendance filters include shifts overlapping the selected local dates.
- Completed sales immutable; no void/edit/refund workflow. Owner handles corrections outside the app. Reports are recorded gross sales, not independently verified settlements or net external adjustments.

## Technical conventions

- Owner security follow-up (2026-10-18): password-only sign-in retained by explicit user choice; authenticator 2FA deferred. Owner access locks after **15 minutes of inactivity** and expires absolutely eight hours after sign-in. Genuine visible-page interaction counts as activity; automatic updates/focus checks do not. Require the owner password again after expiry. Entering the cashier screen in the same browser revokes that browser's owner session, including direct navigation/history restoration; independent personal-device sessions remain available.

- Modular monolith; Next.js App Router, strict TypeScript, React, Tailwind, PostgreSQL, Drizzle, npm lockfile, Vitest, Playwright. Five stage gates follow the preserved project brief.
- Better Auth evaluated for owner email/password auth: use its PostgreSQL/Drizzle adapter, no public signup; employee PIN/device authorization remains a separate, server-controlled workflow. See [Better Auth installation](https://better-auth.com/docs/installation) and [options](https://better-auth.com/docs/reference/options).
- Bind databases and the development app to loopback. Do not deploy. Runtime migrations are explicit administrative commands.
- ESLint stays on the latest 9.x patch compatible with Next's React/import/accessibility plugins; ESLint 10 produced unsupported peer combinations. Upgrade when all plugin peers support it. esbuild is overridden to patched 0.28.2 and must pass migration generation and all gates.
- A sale's UUID is its durable idempotency/recovery key. Persist a server quote and immutable lines before receiving payment; honor that quoted price until explicitly cancelled before payment. Save durably records cashier attestation and then atomically transitions to completed revenue using the same reference. Pending/paid sales survive lock, pairing changes and restarts, and block identity changes except PIN reauthentication by the original cashier. Completed/cancelled snapshots are immutable in PostgreSQL.
- Browser recovery writes the UUID and attempted step to localStorage before financial requests. Never accept new transactions or offer cancellation while payment/completion is uncertain. The server also exposes its single unfinished transaction so recovery is possible without the original browser storage. Browser storage is required before accepting payment; no offline sales mode.
- Report queries share a read-only repeatable-read PostgreSQL snapshot. Local dates map to half-open UTC intervals `[start, next day)` in Asia/Jakarta (UTC+07:00). Attendance overlaps when clock-in is before interval end and clock-out is absent or after interval start. Report range is at most 366 days; sales and attendance histories paginate separately in batches of 25 without truncating totals. Pending/paid records are flagged separately from completed revenue. Returning to cashier through owner navigation signs out the owner.
- Touch UI direction: coffee #36251e, oat #faf6ee, leaf #28624b, butter #f2cf66, paper #ffffff. Humanist system sans for controls; rounded, compact LISI wordmark. Superseded for the cashier by the approved final-two-image reference: photo catalog above compact order summary and bottom payment sheets. Owner styling remains on the original tokens. Visual emphasis belongs to products and the checkout action.
