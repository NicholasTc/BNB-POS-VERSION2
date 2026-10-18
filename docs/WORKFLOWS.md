# Workflows

Approved target behavior; consult PROGRESS.md for implemented/verified stage status.

- Owner: bootstrap locally, sign in at `/owner` from any personal browser/device (concurrent sessions allowed; no cashier pairing needed). Authorize the shared POS only from the intended cashier browser, create employees with unique four-digit PINs, maintain final-price menu items, inspect recorded sales and attendance. Reset credentials locally if owner access is lost.
- Staff controls: Staf opens clock-in/out, switching, lock, attendance, owner access and manual refresh. Ubah in the order summary opens quantity/removal controls.
- Start shift: employee enters own PIN using “Mulai kerja”. First employee unlocks the POS. Additional employees begin their own shifts without ending anyone else's.
- Change cashier: discard an unpaid cart only after explicit confirmation; incoming clocked-in employee enters own PIN. Attendance does not change.
- End shift: employee enters own PIN using “Selesai kerja”. Active cashier is cleared if leaving; another active employee must authenticate. Last employee leaving locks the POS. Idle locking does not end shifts.
- Sale: select items, adjust quantities, select cash/QRIS to open a saved-quote sheet. For cash, enter the received amount and check change; for QRIS, verify the merchant receipt and check the confirmation. One Save action acknowledges receipt and completes the same transaction. Closing/reopening the sheet keeps its quote; explicit unpaid cancellation is under Rincian transaksi. QRIS is recorded manually, never independently verified.
- If a paid sale is uncertain: do not charge again, start a replacement, clear the cart, or change cashier. Keep the transaction visible and use its status/retry recovery. If service remains unavailable, retain the customer payment details and displayed recovery reference for owner follow-up. Owner checks persisted history before entering any replacement.
- Corrections to immutable completed sales happen outside this MVP and are not subtracted from recorded gross sales reports.
