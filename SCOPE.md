# LISI POS MVP

Build the five stages in `docs/PROJECT_BRIEF.md`, subject to approved policy in `docs/DECISIONS.md`.

1. Foundation: strict typed Next app, isolated PostgreSQL, versioned Drizzle migrations, validated environment, secure owner authentication, touch shell, test infrastructure.
2. Attendance/device: four-digit PINs, throttling, concurrent-safe shifts, owner-paired shared device, PIN-authenticated cashier changes, idle locking.
3. Menu/sales: owner menu management, item cart, manual cash/QRIS attestation, historical prices, atomic idempotent paid sales, uncertain-response recovery.
4. Owner: date-filtered sales, item/cashier/payment summaries, itemized history, overlapping attendance history, employee management.
5. Hardening: full regression/security/integrity/usability review, dependency audit, measured local performance, backup/restore verification, reconciled documentation.

Excluded: public deployment, live financial integrations, customer ordering/accounts, delivery, kitchen queues, inventory, payroll, accounting, loyalty, AI, multi-branch/native apps, complex pricing, and sale edits/voids/refunds.
