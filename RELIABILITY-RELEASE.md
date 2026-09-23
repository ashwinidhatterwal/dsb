# Reliability follow-up — 23 September 2026

Prepared against the frozen API 26 checkpoint. This release retains API 26 compatibility and uses new asset version tags. It is a tested candidate, not a deployed or live-certified update.

## Changes

- Order phone cells are explicitly written as text using the Sheets apostrophe escape. Leading zeros survive numeric coercion. Normalization also handles numeric zero without silently converting it to an empty value.
- Checkout rejects all-zero phone numbers in both the browser and backend. Existing 10–15-digit compatibility, including the Indian country-code and trunk-prefix identity comparisons, remains.
- The UTM product picker requests only active product IDs and names. This reduces its response payload; the backend still reads the product table. Older API 26 backends safely return their existing full response until updated.
- Concurrent identical admin reads share one in-flight request. Completed data is not cached by this change, and writes are not automatically retried.
- Read timeouts now say that reading failed. Write timeouts retain the warning that a save may already have succeeded.

## Evidence and limits

`node scripts/run-checks.mjs` passes build consistency and all 23 regression programs. The new regression simulates Sheets numeric coercion, checks phone round trips and tracking identity, rejects all-zero inputs, verifies the minimal UTM projection, checks concurrent read deduplication, and distinguishes read/write timeout messages. Existing stock, cancellation, recovery, role, analytics and publishing regressions also run. These are source/mock tests, not live Apps Script or mobile tests.

The production test order `ORD-7E91F9D023994D32` was created for ₹145 and subsequently verified Cancelled. It stored the invalid all-zero test phone as `0`; its customer tracking failed. No numeric inventory quantity was configured for the selected product, so that live order did not prove numerical stock restoration.

Observed admin product-selector and order-list timeouts do not establish their root cause. This release removes unnecessary transfer and duplicate work but does not claim the timeouts are eliminated. The earlier 20–30% strain reduction remains unmeasured.

## Repository handoff

All changed existing files were matched by Git blob hash to the current repository baseline (commit `46106dcf8f0dbf5711a40b633cf10e308194c4a1`). GitHub rejected creating the candidate tree with HTTP 403, Resource not accessible by integration. No branch, pull request, or deployment was created. A pull-request-only check workflow is included and will run the same regression command when installed.

## Deployment and acceptance

1. Create a staging spreadsheet copy and separate Apps Script deployment. Preserve IDs and transaction tables together. Use isolated notification/payment configuration.
2. Deploy generated `code.gs` from this release to staging, then serve the revised frontend against it. Test a shop-controlled phone, country-code/trunk-prefix equivalents, invalid zeros, and wrong-phone rejection. Existing corrupted phone values must be reconciled with verified original records; do not guess missing digits or bulk-pad numbers.
3. Use a product with stock quantity 2: place one order, verify quantity 1, retry the same request without creating another order, cancel, and verify quantity 2. Repeat size-stock checks separately. Verify customer tracking and admin agree.
4. Check 360/390/412 px phones, 768 px tablet, desktop, Hindi, keyboard dialogs, slow requests and retry/error states. Complete UPI initiation/recovery on isolated test payment settings before any real payment test.
5. In the Apps Script editor, run `setupShopMaintenance()`; authorize and verify its installed triggers. Run `backupShopData()` and verify the resulting private copy, then `setupShopBackups()` if scheduled backups are desired. Run a restore drill on a separate copy. A storefront admin login does not grant access to the Apps Script editor or Drive authorization.
6. Capture repeated quote/order/admin timings and platform errors before and after deployment on the same dataset. Compare p50/p95 and busy/error rates; one successful request is insufficient.
7. After acceptance, deploy the backend and merge/publish the frontend. Keep the frozen checkpoint for code comparison; do not roll back live order data to an old spreadsheet.

No production deployment, Apps Script trigger installation, backup authorization, or fresh live order was performed while preparing this candidate.
