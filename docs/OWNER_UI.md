# Owner navigation redesign

User request (2026-10-18): use the phone/iPad/laptop reference to reduce scrolling; retain every existing capability. This supersedes the earlier request to leave owner styling unchanged. Cashier UI, authentication, financial logic, database schema and APIs stay unchanged.

## Design plan

Palette: oat #faf6ee, paper #ffffff, sidebar #f2ecdf, leaf #24533c, coffee #36251e, border #e9e3d9. Compact Arial/system sans, 28px page titles, 14–16px controls/body, 32px revenue; clear left alignment and tabular amounts. Desktop/tablet: fixed narrow sidebar, compact date toolbar, three metrics, paired payment/bestseller panels, recent transactions. Phone: stacked summary with two small metrics below revenue, fixed labeled bottom navigation and safe-area padding. Use restrained 10–14px corners, product thumbnails and familiar line icons; no decorative charts or invented figures.

Reference review: the green revenue emphasis and warm cards are specifically supplied by the user. Keep the initial screen concise; move detailed reports/management behind explicit navigation instead of shrinking text or dropping records. Preserve server-derived totals, Jakarta boundaries and payment-attestation wording.

## Function mapping

- Ringkasan: revenue, completed count, total item quantity derived from the complete item aggregates, both payment methods/counts, top three products with access to every item/quantity/revenue, recent-sale preview and a clear link to full transactions; unfinished-sale warning remains visible.
- Transaksi: all paginated completed sales, immutable itemized snapshots/references, full unfinished-transaction status and recovery instructions. No new refund/edit/payment-provider behavior.
- Staf: attendance (including overnight/open shifts and existing pagination), sales by employee, employee create/edit/active state/four-digit PIN reset.
- Pengaturan: menu name/price/availability/category/photo editing and cashier connect/revoke. The global toolbar retains persistent Indonesian/English selection, cashier navigation and owner logout.
- Today/yesterday/last seven days shortcuts supplement the existing custom inclusive date range, validation and Show action. One shared applied query retains draft dates, pagination and expanded sales through navigation/live updates/language changes.
- Keep inactive panels mounted but hidden/inert to preserve inputs; expiry/logout must still unmount all private panels. Existing five-second refresh/version/abort guards and idle checks remain in force.
- Summary previews show up to three transactions (two on medium tablet widths). When a later history page is selected, its preview is labeled Riwayat penjualan rather than falsely claiming those rows are the latest. Full history and both independent page positions remain available.

## Verification

Complete sequential gate passed: **21 unit / 56 PostgreSQL integration / 25 Chromium browser tests**, typecheck, zero-warning lint, default Turbopack production build, no migration drift, 13-asset client-secret scan and 15-table backup/restore with matching content/sequences/totals. No API/domain/database/dependency changes; fixtures only touched guarded lisi_test.

Three new browser regressions cover 26 completed sales across two pages, every product aggregate despite the top-three preview, both attendance pages, immutable expanded sale snapshots, unfinished paid records, responsive navigation/overflow, retained employee/menu/category drafts, shared custom dates and shortcut totals. Presets also have a calendar/leap/year-boundary unit regression. Existing security, recovery, attendance, live-report, language and independent-device assertions pass with navigation selectors updated.

Visually reviewed screenshots at 1440×900, 1024×768, 820×1180, 390×844 and 320×760: test-results/owner-{laptop,ipad,portrait,phone,narrow}.png. Phone navigation remains pinned to the viewport, with bottom content padding for scrolling past it; long history is intentionally in its own section. Desktop summary is compact; an unfinished-payment warning may add height. Physical-device/Safari/Firefox and assistive-technology testing remain operational work.

The first restricted build cached a Turbopack worker permission error. Moving only generated production cache to /tmp resolved it; the unchanged default build and full gate then passed. No development data or running development-server files were removed.
