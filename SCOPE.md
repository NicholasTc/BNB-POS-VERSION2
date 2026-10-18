# LISI POS MVP

Build the five stages in `docs/PROJECT_BRIEF.md`, subject to approved policy in `docs/DECISIONS.md`.

1. Foundation: strict typed Next app, isolated PostgreSQL, versioned Drizzle migrations, validated environment, secure owner authentication, touch shell, test infrastructure.
2. Attendance/device: four-digit PINs, throttling, concurrent-safe shifts, owner-paired shared device, PIN-authenticated cashier changes, idle locking.
3. Menu/sales: owner menu management, item cart, manual cash/QRIS attestation, historical prices, atomic idempotent paid sales, uncertain-response recovery.
4. Owner: date-filtered sales, item/cashier/payment summaries, itemized history, overlapping attendance history, employee management.
5. Hardening: full regression/security/integrity/usability review, dependency audit, measured local performance, backup/restore verification, reconciled documentation.

Approved follow-up (2026-10-18): safe automatic cashier listing/status and owner report updates, subtle button feedback, and persistent Indonesian/English owner language preference. Existing attendance/payment/recovery rules and financial snapshots remain unchanged.

Approved reference redesign (2026-10-18): match the user’s final two cashier/payment images, keep the owner layout, add editable product categories/photo URLs and local placeholders, and combine receipt acknowledgment/completion into one Save interaction while retaining existing durable server transitions/recovery. Cash received/change are presentation helpers.

Excluded: public deployment, live financial integrations, customer ordering/accounts, delivery, kitchen queues, inventory, payroll, accounting, loyalty, AI, multi-branch/native apps, complex pricing, and sale edits/voids/refunds.
