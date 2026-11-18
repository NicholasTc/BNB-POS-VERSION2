# Owner alerts

The bell in the authenticated owner toolbar opens **Perlu perhatian / Needs attention**. It shows grouped issues, urgent first, with one action leading to the existing menu, stock, spreadsheet status or transaction screen. No automatic pop-ups, sounds or employee access. The badge counts visible issue groups, not individual products/records; acknowledged urgent issues remain included.

## Conditions

- **Categories (informational):** active products with no category, grouped into one reminder. Inactive products are excluded. Assign categories in the existing menu editor; the alert does not guess names or change products.
- **Low stock (review):** balances from zero through the owner's threshold. Negative supplies are excluded from this group.
- **Negative stock (urgent):** balances below zero. Sales remain recorded; the owner checks physical counts and per-product usage.
- **Sheets:** when sync is intentionally off, no alerts. Invalid configuration/destination binding or stored worker/export failures are urgent; no check-in for two minutes and pending records older than two minutes are review alerts. One grouped Sheets alert chooses configuration, errors, stale worker, then old backlog in that priority. No Google API calls or secret/error-body exposure. Web and worker must share accurate sync settings.
- **Pending payment (review):** an unpaid quote has remained pending for at least 15 minutes.
- **Paid but unfinished (urgent):** attestation is at least two minutes old without completion. This grace period avoids alerting during ordinary Save. Review with the original cashier and use the same reference; never collect payment again. Alerts cannot attest, cancel or complete a transaction.

The payment and sync delays are notification grace periods, not changes to financial or attendance policy. Long-shift alerts are not included because a threshold has not been approved.

## Managing reminders

- **Hapus pengingat / Clear reminder** and **Clear all informational reminders** apply only to the informational reminders shown in the owner's current version of the list. They do not erase products, stock, payments or attendance.
- **Ingatkan 1 jam lagi / Remind in 1 hour** hides a nonurgent reminder for one hour. Urgent issues cannot be dismissed or snoozed.
- **Sudah saya lihat / Acknowledge** marks an urgent issue as seen, while keeping it visible until the underlying issue resolves.
- **Disembunyikan / Hidden** lists active dismissed/snoozed reminders and lets the owner restore them. Opening the bell starts on Active; the list refreshes on opening and while visible.
- Fixing an issue removes it automatically on the next observation. A changed group or observed recurrence resets suppression. Ordinary sales within a low-stock episode do not repeat its reminder; a new delivery/physical count or changed low-stock membership can create a fresh episode.
- Preferences persist on the owner account across browser sessions/devices. There is no browser-local alert data store. Concurrent/stale actions reject with a refresh prompt; clear-all validates every target atomically. Unknown/lost responses show uncertainty, and a read-only status refresh reveals the saved preference without automatic mutation retry.

This is a current-state monitor, not an event log: it detects the current source snapshot when an owner dashboard observes it. It does not record every short-lived transition while all owner dashboards are closed. Intentionally dismissed informational reminders can always be restored from Hidden while that issue remains active.

## Boundaries and efficiency

`src/modules/alerts` owns contracts, detection rules, persistence/query logic, bilingual copy and the client loading hook. `src/app/api/owner/alerts/route.ts` reuses server owner authorization, exact-origin/JSON writes, bounded strict bodies and no-store responses. `owner-alerts.tsx`/CSS own the UI. Existing owner code only mounts the bell and accepts explicit navigation to a settings subtab. Existing forms remain mounted with drafts/filters retained. No cashier, sales, attendance, stock command, reporting calculation or Sheets worker code is changed.

Migration **0010** adds `owner_alert_state` and a partial stock-movement index for the last delivery/count lookup. Six allowed keys plus a per-owner primary key bound metadata to six current episode rows per owner. No unbounded notification history. Source detection uses one MVCC SQL snapshot of current menu/supplies, unfinished sales and the indexed pending export queue, not a scan of historical completed sales. No network calls or business-row locks. A module-only transaction advisory lock (891108) serializes episode/action management and never acquires POS/stock locks.

An alert GET may reconcile only alert-episode metadata. It writes on initial/changed/resolved/expired episodes; repeated unchanged observations are write-free. Only explicit owner management actions create an audit entry. Source rows are always read-only to this module. This isolation means a failed alert read cannot roll back checkout or stock operations. Alert failures preserve the last known list with stale/error feedback; they never claim a confirmed empty/healthy list.

Refresh reuses the shared five-second visible-page/focus/reconnect mechanism, pauses polling during alert writes, and ignores late responses. Background requests validate auth without renewing owner activity. Expired/revoked owner access removes the panel through the existing owner boundary. No new service/dependency or production deployment.

Back up the full database before migration. Deploy migration and matching app together. Full restore includes the episode preferences and index. Automated fixtures run only in guarded loopback lisi_test, with Google off or configuration-only fakes. No new delivery/paid record is inserted into the café database for alert testing.


## Verified locally (2026-11-02)

Full sequential gate: 53 unit, 100 integration and 49 browser tests, build/static/schema/secret checks, and 30-table restore. Supplemental populated dismissed/snoozed preference restore passed. With 500 supplies and 10,000 movements, 12 local measured reads had p95 3.29 ms; this is not a hosted capacity guarantee. Migration 0010 applied to backed-up local dev; all sixteen existing business/stock source tables unchanged. No production deployment. See VERIFICATION.md and PROGRESS.md.
