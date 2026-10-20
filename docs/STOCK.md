# Owner stock

Open **Pengaturan → Stok**. Only authenticated owners can read or change supplies and recipes. The cashier keeps the same cart, payment, receipt and preparation flow.

## Everyday use

1. **Barang → Tambah barang**: name, unit (pcs or pack), actual opening quantity and reminder threshold. Example: Gelas 100 pcs, Pack mangga 30 pack. Units stay fixed to prevent accidental conversions; names and reminder thresholds can be edited.
2. **Pemakaian per menu**: select a product and add what one serving uses. Example: one mango smoothie uses 1 cup + 1 mango pack. Save once. Multiple products may share supplies. An empty recipe means no tracking for that product.
3. **Tambah stok** records an additional delivery. **Sesuaikan stok** records the actual counted balance with a required reason, such as spoilage. Enter the physical quantity, not an amount to subtract. A changed balance/revision rejects stale counts; close the dialog, check the latest stock and recount before saving.
4. **Riwayat** shows opening, deliveries, physical adjustments and sale deductions, including actor, date/time in Jakarta, resulting balance and expandable sale reference. Filter by item; history paginates 25 movements at a time.

Balances at or below the chosen threshold show a warning. Negative stock is permitted and visibly flagged; check the physical stock and product usage before adjusting. Counts use whole pcs/packs, not money, weight or automatic unit conversions. A stock item cannot be deleted because existing recipes/history may reference it.

## Capture and recovery

- A new quote snapshots its configured recipe quantities and supply labels. Recipe edits do not change any saved quote. No recipe means no usage snapshot. Migration does not invent usage for historical or pre-module pending sales.
- Only completed payment deducts stock. One transaction may consume a shared supply through several products; quantities aggregate into one movement per supply/sale. Database locks serialize inventory commands and consumption. Payment completion and stock/order capture commit together, or roll back together. Insufficient/negative stock is not an error; a technical capture failure leaves the paid sale recoverable through the existing same-reference flow.
- Owner mutations have durable UUID receipts. Repeating the same UUID/payload returns its original receipt; changed payloads are rejected. Browser storage keeps identifiers only, before the request. No automatic stock mutation retries.
- If a response is lost, do not re-enter that delivery. **Periksa status stok** resolves a committed receipt. If still unapplied, **Batalkan percobaan** fences late arrival of that UUID before starting again. It never reverses a committed delivery; use a separate reasoned physical adjustment for corrections. Page refresh checks receipts again; unreadable browser storage blocks edits.
- Cached stock balances can change only through immutable movement inserts. Saved recipe usage, operation receipts and movements reject updates/deletes. Stock edit/physical adjustment and recipe commands use optimistic revisions in addition to transaction locks. Owner session expiry, exact-origin write validation, strict schemas and normal audit rules apply.
- List refresh is read-only and retains existing data on failure. Inputs remain drafts; server revision checks govern saving. Background stock reads do not renew owner activity.

## Module boundaries and limits

- `src/modules/stock/types.ts`: strict shared input contracts; `server.ts`: owner commands, receipts and read queries; `use-commands.ts`: UUID-only browser recovery.
- `src/components/stock-*` and scoped `stock.css`: owner-only UI. `src/app/api/owner/stock/route.ts`: owner authorization and query/body validation.
- Migration **0009** adds six stock tables and SQL snapshot/consumption hooks. Existing sales/domain actions are unchanged. Global stock advisory lock 891107 is acquired for commands and quote/completion capture; owner stock commands do not acquire cashier/device locks. Module code must preserve this lock ordering. Movement timestamps are assigned after serialization.
- Maximum 500 supplies; 20 distinct supplies per product recipe. Opening/restock/count/threshold inputs up to 1 billion whole units; per-serving usage up to 1 million. Balance arithmetic uses bounded bigint (±9 trillion) safely representable as JavaScript numbers. No mixed-unit total, fractional quantities, stock reservation, supplier/cost accounting or stock export to Google Sheets.
- Deploy matching migration and application code together using the existing predeploy migration process. Back up and restore the full database, including stock tables and triggers. Do not run fixture tests against café or production databases.

Automated acceptance covers snapshots, negative stock, concurrent/repeated completion and restocking, failed-capture rollback, stale counts/recipes, history pagination, owner/cashier trust boundary, API validation, lost responses, bilingual owner UI and phone/desktop layouts. Full backup verification also reconciles stock balances and completed-sale usage against the ledger.
