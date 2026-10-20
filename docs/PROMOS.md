# Owner promos

Owner: **Pengaturan → Promo**. Enter a name and 1–99% discount. Choose all products or tick selected products. Save; use Ubah to edit or Nonaktifkan to stop future use. The short form works without opening optional conditions.

Optional conditions: quantity of applicable units, distinct applicable products, whole-order spend before discounts, a rupiah cap and application order. For three units of any selected product, set minimum quantity to 3; for three different selected products, also set distinct products to 3. Qualifying promos discount all applicable units in that basket. A specific bundle-only, free-item, fixed-price or scheduled-calendar promotion is outside this percentage builder.

Cashier: add items → Tunai/QRIS → tick eligible promos → review total → continue → existing payment confirmation/save. No configured promos goes straight to payment as before. Ineligible choices explain their condition. Multiple selections are optional; no promo is also allowed.

## Financial rules

- Stack sequentially on remaining eligible product amounts, lower owner priority first. Equal priorities use stable IDs, in the same displayed order. 10% then 20% on Rp100.000 charges Rp72.000. Eligibility always uses the original basket, and a spend minimum counts the whole basket.
- Each promo is floored to whole rupiah and limited by its own cap. Largest-remainder proportional allocation with stable product-ID ties makes product revenue reconcile exactly with net sales, including overlapping selected products. Intermediate allocations use BigInt. 100%/free orders are excluded; very small eligible amounts can round to zero discount.
- A quote locks and validates product prices and selected promo revisions; stale/inactive/ineligible rules reject before any payment. The browser submits IDs/revisions, never authoritative discount amounts. Old no-promo request hashes remain compatible.
- A quote's original line prices/subtotals, rules, names, individual discounts and allocations are immutable. Total is the final amount to collect. Rule edits never reprice an issued, paid, uncertain or recovered quote. To change a pending quote, use the existing explicit unpaid cancellation, then start a new order. Never cancel a payment already received.
- Recovery stores the selected IDs/revisions before preparing. Lost replies reuse that UUID. A rejected promo selection is released only after a serialized missing-ID read confirms no quote exists; the basket stays intact. Payment reads can retry; payment writes remain explicit.
- Reports show final revenue and allocated product revenue. Transaction details retain original prices plus the discount breakdown. Sheets Sales keeps its ten-column format: numeric Total is final revenue, item details include gross amount, named promo deductions and total paid. Attendance quantities and order preparation are unaffected.

## Operations and limits

Apply migration **0008** before the matching app and Sheets worker. It adds promotion and sale_discount tables and extends deferred sale-total checks; it does not rewrite old sales. Restart the worker with the new code so it exports promo breakdowns. Restore all tables, functions and snapshots together; retain PostgreSQL backups.

The bounded catalog supports 100 saved promos, up to 200 selected product IDs per rule and up to 20 promos per quote. Owner rules use server owner authentication, origin validation, audit and revision checks; cashier selection requires a valid paired device, active employee/shift and current cashier generation. Secrets and owner permissions stay on the server. No new service, provider or dependency.

Automated fixtures target loopback lisi_test only; Google is disabled/faked. Hosted deployment and live Sheet delivery require their separate deployment checks.
