# Workflows

Approved target behavior; consult PROGRESS.md for implemented/verified stage status.

- Owner: bootstrap locally, sign in at `/owner`, authorize the shared device, create employees with unique four-digit PINs, maintain final-price menu items, inspect recorded sales and attendance. Reset credentials locally if owner access is lost.
- Start shift: employee enters own PIN using “Mulai kerja”. First employee unlocks the POS. Additional employees begin their own shifts without ending anyone else's.
- Change cashier: discard an unpaid cart only after explicit confirmation; incoming clocked-in employee enters own PIN. Attendance does not change.
- End shift: employee enters own PIN using “Selesai kerja”. Active cashier is cleared if leaving; another active employee must authenticate. Last employee leaving locks the POS. Idle locking does not end shifts.
- Sale: select items, adjust quantities, select cash/QRIS, verify the displayed total and actual receipt of payment, attest receipt, then finalize. QRIS is recorded manually, never independently verified.
- If a paid sale is uncertain: do not charge again, start a replacement, clear the cart, or change cashier. Keep the transaction visible and use its status/retry recovery. If service remains unavailable, retain the customer payment details and displayed recovery reference for owner follow-up. Owner checks persisted history before entering any replacement.
- Corrections to immutable completed sales happen outside this MVP and are not subtracted from recorded gross sales reports.
