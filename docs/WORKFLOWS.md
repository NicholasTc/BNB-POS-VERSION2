# Workflows

Approved target behavior; consult PROGRESS.md for implemented/verified stage status.

- Owner: bootstrap locally, sign in at `/owner` from any personal browser/device (concurrent sessions allowed; no cashier pairing needed). Authorize the shared POS only from the intended cashier browser, create employees with unique four-digit PINs, maintain final-price menu items, inspect recorded sales and attendance. Reset credentials locally if owner access is lost.
- Staff controls: Staf opens clock-in/out, switching, lock, attendance, owner access and manual refresh. Ubah in the order summary opens quantity/removal controls.
- Start shift: employee enters own PIN using “Mulai kerja”. First employee unlocks the POS. Additional employees begin their own shifts without ending anyone else's.
- Change cashier: discard an unpaid cart only after explicit confirmation; incoming clocked-in employee enters own PIN. Attendance does not change.
- End shift: employee enters own PIN using “Selesai kerja”. Active cashier is cleared if leaving; another active employee must authenticate. Last employee leaving locks the POS. Idle locking does not end shifts.
- Sale: select items, adjust quantities, select cash/QRIS. If promos are configured, optionally select eligible promos and review the preview before continuing to the saved-quote sheet. For cash, enter the received amount and check change against the discounted total; for QRIS, verify the merchant receipt and check the confirmation. One Save action acknowledges receipt and completes the same transaction. Closing/reopening the sheet keeps its fixed quote; explicit unpaid cancellation is under Rincian transaksi. QRIS is recorded manually, never independently verified.
- If a paid sale is uncertain: do not charge again, start a replacement, clear the cart, or change cashier. Keep the transaction visible and use its status/retry recovery. If service remains unavailable, retain the customer payment details and displayed recovery reference for owner follow-up. Owner checks persisted history before entering any replacement.
- Owner promos: Pengaturan → Promo; name/percentage/all or selected products are the basic form. Optional conditions and priority are under Syarat & batas. Ubah and Nonaktifkan affect future quotes only. Multiple promos apply sequentially in owner order, rounded down; see PROMOS.md.
- Corrections to immutable completed sales happen outside this MVP and are not subtracted from recorded revenue after promos.

## Paid orders and end of session

After payment is saved, scroll below checkout to **Sedang disiapkan**. Each paid order shows its reference, historical items/quantities and cashier. Press **Selesai** after it is ready to serve; it moves to **Pesanan selesai** for this work session. This records preparation only, never another payment. Your next cart stays intact. Use Perbarui daftar after a connection problem; do not take another payment. If a finish reply was lost, the refreshed list or an explicit same-order retry resolves the durable status.

A work session starts at the first clock-in and ends at the last clock-out, even across midnight. Switching/locking/reconnecting does not end it. Finished orders remain stored; the next session starts with a fresh finished list. Pending orders carry forward with a **Dari sesi sebelumnya** label. Lists show 20 orders per page with Sebelumnya/Berikutnya.

The final employee's PIN-authenticated clock-out locks the cashier and shows **Kerja bagus!** with all session participants and the quantity of all products sold. Pending preparation is warned about and preserved. The summary closes after 60 seconds, on Tutup or Escape. It is a temporary acknowledgment, not another report or payment; refreshing dismisses it. If the clock-out reply is lost, check attendance before retrying; the durable clock-out/session/order records remain authoritative even if the celebration could not be shown.

After upgrading an existing installation, active shifts join the initial tracked session. Old completed transactions are not placed into the preparation queue; the new operational lists/counts start with sales completed after migration. Financial history remains available in the owner dashboard and spreadsheet.
