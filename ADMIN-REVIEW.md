# Admin workspace v7 follow-up — 10 September 2026

Implemented the feasible gaps from the previous review: session draft recovery and
unsaved-change prompts; category/stock/sort filters; server-side product paging;
fixed-value bulk price/stock updates; reversible archive/restore; full product
revision checks; separate manual payment verification with payment filters;
optional individually keyed staff roles; and an admin activity view.

Everything fits in the existing admin page. Read **ADMIN-SETUP.md** before updating:
this version requires deploying the new code.gs before the new website files.
It adds metadata columns/history automatically while preserving existing sheet data.

Verified: the existing 30 regression checks, 8 new backend checks, and integrated
frontend/backend fixtures for paging, filters, draft recovery, bulk updates,
archive/restore, payment recording, activity and viewer controls. No live production
writes or visual browser/device testing were performed.

Remaining limits: Google Sheets still scans rows for server-side searches; bulk
updates can partially succeed; UPI verification is manual; drafts live only in the
tab session; staff configuration lives in Script Properties; history excludes direct
sheet edits and is not tamper-proof. See the setup guide for details.

---

Historical v6 review below. Items it describes as remaining were assessed and
addressed above where feasible; its v6-only installation instructions are superseded.

# Admin review — 10 September 2026

Reviewed the complete admin.html and admin.js files: navigation, connection,
product list/editor, image uploads, orders, dashboard and responsive styling.
Also inspected the related Apps Script authentication, product validation,
stock-concurrency checks and order-status write paths. No live shop writes were made.

## Implemented improvements

| Weakness | Change |
| --- | --- |
| Unstyled pagination only below products | Matching violet/cyan navigation above and below the list, numbered pages, current-page indicator, product range and disabled boundary buttons |
| Bottom pagination leaves the next list above the viewport | Page changes scroll to and focus the top pagination; reduced-motion preference respected |
| Product search redraws on every keystroke and misses Hindi names | 150 ms debounce; searches Hindi names and tags as well as existing fields |
| Workspace search and Ctrl/Cmd K affordance did nothing | Enter opens matching products; shortcut focuses product search |
| Refresh failures shown only on hidden connection screen | Visible product status, explicit Refresh control, retained previous results |
| Older product/dashboard responses could replace newer data | Request sequence checks discard stale responses |
| Concurrent uploads/saves could modify the wrong edit form | Shared editor lock disables fields and prevents another edit/save/upload until completion |
| Stock comparison used the refreshed product array, not the opened form | Capture the original product at edit time so backend stock-conflict checks use the correct baseline |
| Repeated order-update/delete clicks could issue overlapping writes | Per-record pending guards and disabled controls |
| Order changes left dashboard/inventory stale | Refresh related data after confirmed status changes |
| Dashboard refresh always reported success and fetched unnecessary order pages | Refresh dashboard directly; success feedback reflects its result |
| Dashboard counters could run competing animations | Cancel previous animation; render immediately with reduced motion |
| Missing client validation caused avoidable failed requests | Validate non-negative cost/MRP and whole non-negative tracked stock quantities |
| Additional polish | Login with Enter, accessible page/focus states, mobile toast clearance, escaped dashboard labels and quantities |

## Verification

JavaScript syntax check and focused jsdom interaction checks passed for:
- Both pagers, page changes, scroll/focus target, last page and empty results.
- Hindi product search and workspace search.
- Original edit-time stock snapshot in the outgoing save payload.
- Invalid fractional stock rejection without a write.
- Editor locking during upload and recovery afterwards.
- Duplicate order-status request suppression.
- Stale product-response rejection and visible refresh failure with usable controls.

These are isolated DOM and request fixtures, not a real browser layout test.
Native mobile rendering, Cloudinary uploads and production Apps Script writes
were not exercised. Backend bytes match the previous version.

## Remaining limitations

- Product pagination is local: the admin still downloads the full catalogue once.
  It renders 40 products at a time, but very large catalogues would benefit from
  server-side product pagination and search, which requires a coordinated backend update.
- Authentication remains the existing shared admin key held in tab memory;
  there are no individual staff roles or per-user audit identities.
- Existing stock-conflict protection is preserved. Concurrent edits to other
  product fields by different admins still use the backend's existing last-write behavior.
- Read/write network timeouts can leave a write's outcome uncertain. The UI keeps
  its existing instruction to refresh before retrying; it does not automatically retry writes.
- Form state stays in memory while switching tabs. Unsaved drafts are not recovered
  after a browser reload. Clearing or opening another product replaces the current draft.

## Installation

For the immediately preceding install5 package, replace admin.html and admin.js.
The full ZIP also includes all earlier storefront changes. No Apps Script
redeployment or Google Sheets schema changes are needed for this admin update.
