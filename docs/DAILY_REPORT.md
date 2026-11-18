# Laporan Harian — TEST rollout

The owner approved adding one report tab to the existing TEST spreadsheet. Sales remains the detailed transaction log and Attendance remains the shift log. The new module does not alter checkout, menu editing, promos, stock deductions, attendance, authentication or existing export row mappings.

## Owner use

Open **Laporan Harian**. The green date cell **B2** selects the report date (Jakarta time). It initially follows today's date. Choose another date in the same cell to inspect history; enter `=$H$2` to follow today again. The date choice is never overwritten by the worker. No new tab is created per day. The small line above the table gives the selected day's publication time, or says the report is not ready. It does not present an unpublished date as zero sales.

Columns match the approved example: MENU, JUMLAH TERJUAL, **TOTAL (left blank)**, HARGA JUAL, TOTAL OMSET, KETERANGAN. The bottom amount sums net revenue. The report uses completed sales by completion date; pending, merely acknowledged and cancelled sales are excluded. A product sold at different historical prices or names has separate rows to avoid a misleading unit price. Existing combo menu products stay as sold; separate items are never automatically interpreted as a bundle.

Net revenue is the recorded amount after the saved discounts. Promo notes show each applicable saved promo name/percentage and the exact deduction allocated to that product. Full-price and discounted units can share a daily row: two Rp32.000 croissants with only one discounted 10% yield Rp60.800, not Rp57.600. The module replays immutable saved rules with the existing calculator and rejects inconsistent snapshots rather than guessing amounts.

Zero-sale active products are included. PostgreSQL does not hold a complete historical menu catalogue: during initial historical backfill, currently active products created by that date can be listed, but unknown unsold historical prices stay blank with an explicit note. Historical sold prices remain exact. From activation onward, the worker retains the last observed catalogue for each day; it is not a guarantee of catalogue changes that happened while the worker was stopped. Prior inactive/deleted unsold menus cannot be reconstructed from sales data.

## Implementation and safeguards

- `src/modules/daily-report/{project,dates}.ts` owns the pure projection/date handling. `sync.ts` reads source tables and writes only its three `sheets_daily_*` metadata/cache tables (migration 0011). No new triggers, routes, dependencies or POS transaction hooks.
- `google.ts` creates/updates only Laporan Harian. Source rows/status live in hidden columns H:R in this same tab, not another tab. Managed cells should not be edited/sorted; only B2 is an input. Names and notes are literal string cells to prevent formula injection; money and quantities are numeric. Generated FILTER/SORT/VSTACK formulas switch dates inside Google Sheets without requiring the POS or an owner page to be open.
- Optional `SHEETS_DAILY_REPORT_ENABLED=true` integrates with the existing independent worker after core export commits. Default is off. The report has a separate advisory lock, destination binding, retry/backoff and once-daily repair pass. Report failures cannot invalidate existing Sales/Attendance export receipts or stop cashier transactions. The worker must be running for fresh data; selecting already published dates uses the saved sheet data immediately.
- First activation scans completed history and the catalogue. Up to seven dirty days are published per pass, today first, with the remaining history following over subsequent 30-second passes. Stable row reservations precede Google writes; retrying an uncertain reply writes the same positions. Day data and its publication timestamp are one atomic Google batch. A newly committed sale is detected on the next pass. These are convergence/recovery safeguards, not exactly-once network delivery.
- Only the approved TEST spreadsheet and actual loopback lisi_dev/lisi_test connection string are accepted. Live mode, alternate destinations and URL overrides fail before Google access. No production changes are made by this rollout.
- Guarded limits: 3,660 calendar days, 100,000 reserved report rows, 45,000 characters per promo note, 1.5 MB day write and conservative workbook cell budget. Reaching a limit reports a delayed report; no silent truncation, deletion or automatic archive. Ownership marker/header/formula and stable hidden-row identities are checked before writing; a conflicting edited/renamed/moved report stops safely. Existing unrelated sheets are preserved.

## Local activation and verification

After passing the gate, back up the local development database, apply migration 0011, and restart the matching local worker with `SHEETS_DAILY_REPORT_ENABLED=true` alongside the existing TEST settings. Keep private credentials outside the repository. Automated tests use isolated lisi_test and fake Google transports; only the separate approved TEST smoke uses local café records. Production remains disabled until the owner reviews TEST and explicitly requests rollout.

Verification status is recorded in PROGRESS.md and VERIFICATION.md. The existing SQL backup remains necessary; a human-readable spreadsheet report does not replace database disaster recovery.
