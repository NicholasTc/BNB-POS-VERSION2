# First-use testing walkthrough

Use this for local manual acceptance testing. Automated verification is recorded in VERIFICATION.md; this is not a production launch.

## 1. Open the local app

On 2026-10-18 the databases were healthy and LISI was already serving at http://127.0.0.1:3000. Use that exact address, rather than localhost or another port. Leave the existing server running. On later days, start Docker Desktop, run `docker compose up -d --wait`, then `npm run dev` if the app is not running.

## Local test credentials

Created in the local development database on 2026-10-18 at your request. These credentials are intentionally recorded in plaintext for manual testing only. Do not reuse them for real café accounts.

- Owner login: http://127.0.0.1:3000/owner
- Owner email: `owner@lisi.test`
- Owner password: `LisiTest-c7a88OvMaYq4YO3VECtk`
- Employee **Ayu**: PIN **0123** (active)
- Employee **Bima**: PIN **4567** (active)

The owner and both employee accounts already exist. Skip owner provisioning and employee creation; sign in with the credentials above. Menu items, attendance and sales have not been created by this account setup.

If you intentionally need to reset the owner later, run `python3 scripts/provision-owner.py` from the project directory. Resetting revokes existing owner sessions; update this guide if you change the testing password.
## 2. Configure a sample café

Open http://127.0.0.1:3000/owner and sign in. Scroll to **Pengaturan kafe**.

- Select **Hubungkan perangkat ini** and confirm.
- **Ayu** and **Bima** are already created and active. Do not add duplicates.
- Add available menu items **Kopi susu** for **18000**, **Croissant** for **22000**, and **Teh lemon** for **15000**. Enter whole rupiah without dots or commas.
- Select **Kasir** at the top to return. This signs the owner out.

Use dummy data and pretend payments. No payment provider is connected; the app records your confirmation without moving money. Test sales persist in the development database and cannot be edited/voided through the app. Automated fixtures use a separate test database and do not clear these manual records.

## 3. Test attendance and switching

1. Select **Mulai kerja**, enter **0123**, then submit. Ayu should become active cashier and appear under Sedang bekerja.
2. Repeat Mulai kerja with **4567**. Both employees should be working; Ayu remains cashier.
3. Select **Ganti kasir**, enter **4567**, then **Jadi kasir**. Bima should now be cashier; there should still be two shifts.
4. Refresh the page. The cashier and both shifts should remain.

## 4. Make two sample sales

With **Bima** as cashier:

1. Add **two Kopi susu** and **one Croissant**. Check quantities and total **Rp58.000**.
2. Select **Tunai**, then **Lanjut pembayaran**. Review the saved amount.
3. For this simulated test, select **Pembayaran sudah diterima**. Wait for the saved-payment acknowledgment, then select **Selesai**.
4. Expect **Penjualan tersimpan!**, the correct amount and Bima's name. Retain the LS-reference when investigating a problem.

Select **Pesanan baru**, switch cashier to **Ayu** using 0123, then sell **one Teh lemon** using **QRIS**, following the same acknowledgment and completion steps. Expect **Rp15.000** attributed to Ayu. QRIS remains manually recorded, not provider-verified.

## 5. Reconcile owner reports

Select **Pemilik**, sign in, and filter the dates containing these sales. Starting from an empty database, expect:

- Recorded revenue **Rp73.000**, completed sales **2**.
- Cash **Rp58.000**, QRIS **Rp15.000**.
- Bima **Rp58.000**, Ayu **Rp15.000**.
- Kopi susu quantity **2**, Croissant **1**, Teh lemon **1**.
- Two attendance shifts. Expand each sale in Riwayat penjualan to check historical names, prices and quantities.

Additional completed tests will change these totals. Returning through Kasir signs the owner out.

## 6. Test mistakes, locking and clock-out

- Try **one** incorrect PIN: access should be denied. Avoid ten failed attempts, which can lock correct PIN access for up to 15 minutes.
- Add an unpaid cart, then choose Ganti kasir. Cancel the discard confirmation: the cart should remain. A confirmed discard plus successful incoming PIN should clear it.
- Select **Kunci kasir**: attendance remains open. Ganti kasir with an active employee's PIN should unlock access. Optional: verify automatic locking after 15 minutes without interaction.
- With no unfinished payment, select **Selesai kerja** and enter Bima's PIN. His shift should close while Ayu remains working. Repeat with Ayu: the final shift closes and the POS locks.

## Optional: interrupted connection

Do this after reconciling the baseline above, because it creates another test sale. Prepare a sale and record simulated receipt of payment. In browser developer tools, set Network to Offline, then select Selesai. The app must not show success. Restore Online, choose Perbarui & periksa, and finish the same transaction. Verify only one completed sale with that reference. Never create a replacement or request a second customer payment while status is uncertain.

`npm run gate` runs all automated checks, including deliberate lost responses and a real database connection outage. Do not run automated tests while simultaneously experimenting with another test runner; fixtures are isolated but share their own test database. See OPERATIONS.md for outage and backup procedures.

## Optional: automatic updates and owner language

Use separate browser profiles/windows (one can be private) for the owner and cashier. Pair the cashier browser as usual, then sign the owner out there before using the owner in the other profile. Ordinary tabs in the same profile share login cookies; selecting Kasir signs that owner session out.

1. Keep the cashier visible with an unpaid item in the cart. Change a product name/price or active status in the owner dashboard. The cashier listing should update within about five seconds. The existing cart should retain its quantities and prices; a stale price is still rejected before payment using the existing refresh workflow.
2. Repeat a menu change after opening a saved payment quote. Its amount must stay unchanged; listing refresh resumes after checkout/recovery finishes. Do not request another payment when a response is uncertain.
3. Change an employee name or reset a PIN in the owner dashboard. Cashier status should reflect the change automatically. PIN reset still revokes access and requires reauthentication; it must not close attendance or erase an unpaid cart or unfinished sale.
4. Keep the owner report visible on dates containing the next sale. Expand an existing sale and type, but do not apply, another date range. Complete a cashier test sale. Report totals/history should update within about five seconds; the expanded record and draft date inputs should remain. Applied historical dates must not reset to today.
5. Briefly disconnect the owner browser. Existing report data should remain with a quiet stale-data message; restore connectivity and focus the page to resume updates. Background updates must not prolong an idle owner login or cashier inactivity timer.
6. Buttons should show a subtle pressed state. Async actions show a working label/disabled state until their result is known; failed saves must not show success.
7. In the owner header, select **English** under **Bahasa / Language**. Check reports, employee/menu management and settings; partially entered forms should remain. Reload, sign out/in, and sign in from a fresh browser profile: English should persist. Switch back to **Bahasa Indonesia** and verify the same persistence. Product/employee names, rupiah values and Jakarta business dates do not change language or meaning.

## Report an issue

Record the screen/action, expected versus actual behavior, cashier name, approximate Jakarta time, and LS-reference where applicable. A screenshot is useful. Never include passwords, PINs, cookies, or .env.local contents.
