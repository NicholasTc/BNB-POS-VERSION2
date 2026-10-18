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

The owner and both employee accounts already exist. Skip owner provisioning and employee creation; sign in with the credentials above. That account setup did not seed menu items, attendance or sales; subsequent manual tests may already have added records.

If you intentionally need to reset the owner later, run `python3 scripts/provision-owner.py` from the project directory. Resetting revokes existing owner sessions; update this guide if you change the testing password.
## 2. Configure a sample café

Open http://127.0.0.1:3000/owner and sign in. Use the sidebar (tablet/laptop) or bottom navigation (phone).

- Open **Pengaturan → Perangkat kasir**, select **Hubungkan perangkat ini** and confirm. Use this only on the actual shared cashier browser.
- Open **Staf → Kelola staf**. **Ayu** and **Bima** are already created and active. Do not add duplicates.
- Open **Pengaturan → Menu kafe**. Add these sample products only if they do not already exist: **Kopi susu** for **18000**, **Croissant** for **22000**, and **Teh lemon** for **15000**. Enter whole rupiah without dots or commas.
- Set **Kategori** to Minuman for drinks and Makanan for Croissant. Under **Foto menu (opsional)**, select a placeholder or enter an HTTPS photo URL. Examples: `/menu/coffee.webp`, `/menu/pastry.webp`, `/menu/tea.webp`, `/menu/mango.webp`, `/menu/strawberry.webp`, `/menu/avocado.webp`, `/menu/water.webp`. Existing products start uncategorized and remain visible under Semua; their names/prices are preserved.
- Select **Kasir** at the top to return. This signs the owner out.

Use dummy data and pretend payments. No payment provider is connected; the app records your confirmation without moving money. Test sales persist in the development database and cannot be edited/voided through the app. Automated fixtures use a separate test database and do not clear these manual records.

## 3. Test attendance and switching

1. In the **Belum ada kasir** bar, select **Masuk**, enter **0123**, then **Mulai kerja**. The bar should change to **Kasir: Ayu · Aktif** without shifting the category tabs. Open **Staf** to see Sedang bekerja and the attendance controls.
2. Open **Staf → Mulai kerja** with **4567**. Both employees should be working; Ayu remains cashier.
3. Select **Staf → Ganti kasir**, enter **4567**, then **Jadi kasir**. Bima should now be cashier; there should still be two shifts.
4. Refresh the page. The cashier and both shifts should remain.

## 4. Make two sample sales

With **Bima** as cashier:

1. Tap **Kopi susu** twice and **Croissant** once. Check the quantity badges and total **Rp58.000**. **Ubah** opens quantity +/- and removal controls.
2. Select **Tunai** to open the payment sheet with the saved total. Enter **100000**, using the field, quick amount or keypad. Expect **Rp42.000** change; entering less than Rp58.000 must keep Save disabled.
3. For this simulated test, select **Uang diterima · Simpan** once. It acknowledges receipt and completes the same transaction; wait for the confirmed result.
4. Expect **Penjualan tersimpan!**, the correct amount and Bima's name. Retain the LS-reference when investigating a problem.

Select **Pesanan baru**, switch through **Staf → Ganti kasir** to **Ayu** using 0123, then sell **one Teh lemon** using **QRIS**. Check the quoted amount, verify the simulated merchant receipt, select **Pembayaran Rp15.000 sudah saya cek masuk**, then **Pembayaran diterima · Simpan**. The checkbox alone must not record payment. Expect **Rp15.000** attributed to Ayu. QRIS remains manually recorded, not provider-verified.

**Tutup** or Escape closes a payment sheet without cancelling the saved quote. Use **Lanjutkan pembayaran** to reopen it. For an unpaid cancellation, expand **Rincian transaksi → Kembali, belum dibayar** and confirm. Never cancel or request another payment when status is uncertain.

## 5. Reconcile owner reports

Select **Staf → Pemilik**, sign in, and open **Ringkasan**. Use Hari ini/Kemarin/7 hari or **Pilih tanggal → Tampilkan** for a custom range. Starting from an empty database, expect:

- Recorded revenue **Rp73.000**, completed sales **2**.
- Cash **Rp58.000**, QRIS **Rp15.000**.
- Under **Staf → Kehadiran & penjualan**: Bima **Rp58.000**, Ayu **Rp15.000** and two attendance shifts.
- Under **Ringkasan → Lihat semua menu**: Kopi susu quantity **2**, Croissant **1**, Teh lemon **1**.
- Under **Transaksi**: expand each sale in Riwayat penjualan to check historical names, prices and quantities. Unfinished payments and their recovery instructions remain here. Both sales and attendance retain independent pagination.

Switch sections with an unsaved product/employee draft or custom date input: your work should remain. The summary is a short preview; use its links for complete details. Language, Kasir and Keluar stay in the top toolbar.

Additional completed tests will change these totals. Returning through Kasir signs the owner out.

## 6. Test mistakes, locking and clock-out

- Try **one** incorrect PIN: access should be denied. Avoid ten failed attempts, which can lock correct PIN access for up to 15 minutes.
- Add an unpaid cart, then choose **Staf → Ganti kasir**. Cancel the discard confirmation: the cart should remain. A confirmed discard plus successful incoming PIN should clear it.
- Select **Staf → Kunci kasir**: attendance remains open. **Masuk** with an active employee's PIN should unlock access without creating another shift; **Staf → Ganti kasir** remains available. Optional: verify automatic locking after 15 minutes without interaction.
- With no unfinished payment, select **Staf → Selesai kerja** and enter Bima's PIN. His shift should close while Ayu remains working. Repeat with Ayu: the final shift closes and the POS locks.

## Optional: interrupted connection

Do this after reconciling the baseline above, because it creates another test sale. Prepare a sale, fill the cash amount or check the QRIS receipt checkbox. In browser developer tools, set Network to Offline, then select the sheet’s Save button. The app must not show success. Restore Online, choose **Periksa status transaksi** in the payment sheet, then finish the same transaction if still pending/paid. **Staf → Perbarui & periksa** also remains available after closing the sheet. Verify only one completed sale with that reference. Never create a replacement or request a second customer payment while status is uncertain.

`npm run gate` runs all automated checks, including deliberate lost responses and a real database connection outage. Do not run automated tests while simultaneously experimenting with another test runner; fixtures are isolated but share their own test database. See OPERATIONS.md for outage and backup procedures.

## Owner access from personal devices

The owner dashboard is intended for any personal tablet/laptop/desktop browser. Open `/owner` and sign in; no device connection is required. Multiple owner sessions can stay open alongside the cashier. Use **Connect this device / Hubungkan perangkat ini** only on the browser that should become the cashier terminal, because it replaces the previously paired cashier browser. Signing in or signing out of a separate personal browser must not disconnect the cashier or another owner session.

For local testing, use separate browser profiles to simulate independent devices. Physical devices will use the same hosted HTTPS URL after deployment; `127.0.0.1` currently refers to each device itself.

## Optional: automatic updates and owner language

Use separate browser profiles/windows (one can be private) for the owner and cashier. Pair the cashier browser as usual, then sign the owner out there before using the owner in the other profile. Ordinary tabs in the same profile share login cookies; entering the cashier screen signs that owner session out, including direct URL navigation.

1. Keep the cashier visible with an unpaid item in the cart. Change a product name/price or active status in the owner dashboard. The cashier listing should update within about five seconds. The existing cart should retain its quantities and prices; a stale price is still rejected before payment using the existing refresh workflow.
2. Repeat a menu change after opening a saved payment quote. Its amount must stay unchanged; listing refresh resumes after checkout/recovery finishes. Do not request another payment when a response is uncertain.
3. Change an employee name or reset a PIN in the owner dashboard. Cashier status should reflect the change automatically. PIN reset still revokes access and requires reauthentication; it must not close attendance or erase an unpaid cart or unfinished sale.
4. Open **Transaksi** on dates containing the next sale. Expand an existing sale; open **Pilih tanggal** and type, but do not apply, another date range. Complete a cashier test sale. Report totals/history should update within about five seconds; the expanded record and draft date inputs should remain. Applied historical dates must not reset to today. Return to Ringkasan to check its totals.
5. Briefly disconnect the owner browser. A report refresh failure may show a quiet stale-data message; when the owner-access check fails, private content is hidden pending revalidation. Restore connectivity and focus the page: valid access restores the existing form drafts. Background updates must not prolong an idle owner login or cashier inactivity timer.
6. Buttons should show a subtle pressed state. Async actions show a working label/disabled state until their result is known; failed saves must not show success.
7. In the owner header, select **English** under **Bahasa / Language**. Check reports, employee/menu management and settings; partially entered forms should remain. Reload, sign out/in, and sign in from a fresh browser profile: English should persist. Switch back to **Bahasa Indonesia** and verify the same persistence. Product/employee names, rupiah values and Jakarta business dates do not change language or meaning.

## Owner security checks

Use simulated transactions and separate owner/cashier browser profiles.

1. On the employee cashier browser, open `/owner`: only owner sign-in should appear. An employee PIN must not work as the owner password; never give employees the owner password. Opening the sign-in page is allowed; private data and management actions require owner authentication.
2. Sign in as owner on the shared browser, then enter `/` directly in the address bar. Wait for the cashier screen, then use Back or another owner tab in that profile. It must require owner sign-in again and show no private reports/forms. If handoff fails during an outage, cashier access stays blocked until retry confirms logout.
3. On a separate owner profile, leave the dashboard untouched for 15 minutes while its reports refresh. It must return to sign-in; the owner password is required again. Typing/clicking in the visible dashboard counts as activity; background updates and switching focus do not. All sessions expire eight hours after sign-in even with activity.
4. While signed in, open **Pengaturan → Menu kafe**, enter an unsaved menu draft and switch browser tabs briefly. Return: access is checked and the draft should remain. Sign out from another tab in that same profile: private forms/reports should disappear. Reopening the dashboard must require sign-in. Independent owner browser profiles remain signed in.
5. Avoid repeatedly testing wrong passwords against your ordinary local account: 10 failed/reserved attempts trigger a shared 15-minute limit, including correct-password retries. Automated security tests cover throttling, forged identities/cookies, direct protected API calls and failed database revocation using only the isolated test database.

## Report an issue

Record the screen/action, expected versus actual behavior, cashier name, approximate Jakarta time, and LS-reference where applicable. A screenshot is useful. Never include passwords, PINs, cookies, or .env.local contents.
