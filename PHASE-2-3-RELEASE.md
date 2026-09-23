# Phase 2 and 3 release — backend API 24

Built from your category-height-fixed attachment. All CSS and storefront JavaScript are unchanged. Three missing GitHub publishing files were restored from Phase 1. This ZIP is prepared and locally checked; it is not deployed or live-certified.

## Phase 2: commerce safeguards

- Equivalent Indian phone formats share promo eligibility and rate limits. Historical promo hashes and order-result lookups remain readable through bounded alias checks. Existing checkout fingerprints, quote payload normalization and transaction recovery formats remain compatible; no historical phone rows are rewritten.
- Validated order snapshots explicitly distinguish a known zero cost from a missing/invalid cost. New unknown-cost accounting cells remain blank. Monthly profit returns incomplete rather than overstating profit. Legacy zero-cost snapshots remain ambiguous; positive legacy costs are usable. Do not fill historic cost gaps from today's product prices without verifying the original purchase cost.
- Customer cancellation eligibility and duplicate-request checks now execute under the same write lock as order status changes. Resolving cancellation still uses the existing stock-restoration transaction path.

## Phase 3: analytics reliability and operating load

- Reset boundary is checked again inside ingestion's write lock. Reports carry a reset epoch; stale cached reports are rejected, and a reset during report generation requires a refresh.
- Duplicate queue IDs are rejected within a batch and across the entire active sheet after cache eviction, including retries beyond the former 1,500-row tail. Queue IDs and timestamps are required. Events older than 14 days, invalid timestamps, and timestamps over five minutes ahead are discarded; slight clock skew is clamped to receipt time.
- Soft global limit: 120 ingestion batches/minute, plus the existing per-visitor limit. This cache-backed limit is best-effort, not a security or billing quota. Busy/throttled responses leave the browser queue available for retry.
- Schema checks use one header read per analytics sheet check. Mixed-case column checks no longer create repeated columns. Existing extra columns are preserved, and event writes follow the actual header layout.
- Ingestion no longer invalidates the report cache every batch. Automatic reports may lag up to 60 seconds. Force Refresh, reset and commerce invalidation remain available. Failed analytics reads surface an error rather than a convincing zero report.
- Optional hourly maintenance archives at most 300 expired prefix rows per run. The active target is 200 days, covering 90-day reports plus their comparison period. Stable archive IDs, full-row read-back verification and copy-before-delete make retries recoverable. Raw records go to hidden monthly AnalyticsArchive_YYYY_MM tabs. Exact period visitor/session sets are retained; daily unique counts are never added together.
- Archival bounds the active time window when maintenance keeps up; it is NOT a hard row cap. Monthly archives continue consuming spreadsheet storage. Reports still read Orders and OrderItems history. At larger traffic volumes a database/analytics warehouse remains necessary. Old out-of-order or malformed leading dates can stop prefix archival; inspect health and the first active rows rather than deleting data blindly.
- Analytics and checkout still share Apps Script's script lock. There is no claim of independent named locks. Maintenance is bounded and off the shopper's request path, but can briefly contend for the lock.
- `getShopOperationalHealth()` is an editor-only function reporting pending transactions, Telegram pending count/age, active event rows, maintenance trigger presence, last run and last error. It logs no customer payloads. Telegram age is based on journal updated time, not exact notification-enqueue time.

## Deploy in stages

1. Copy the current spreadsheet (all tabs), download the current Apps Script source, and retain the currently deployed website ZIP. Save Script Properties securely; never commit secrets. Note the existing deployment ID and trigger list. A spreadsheet copy alone does not back up script properties, deployments or triggers.
2. In a staging copy, paste the new root `code.gs`. Preserve your deployment settings, spreadsheet binding, configuration and secrets. Deploy a new Apps Script version. New admin requires API 24; deploy backend before replacing website/admin files.
3. Upload the website files, including dot-directory `.github` if using the supplied publishing workflow. Keep your existing endpoint configuration and repository/domain settings.
4. Check mobile home/category cards, product details, sizes, cart quantity, delivery estimate, promo quote, and checkout. In staging, place one controlled order; retry the same request and verify one order and one stock deduction. Check tracking with equivalent phone formats, request cancellation, and verify stock restoration once. Confirm Telegram delivery on your own test channel. Check missing-cost profit displays Incomplete.
5. Check analytics with a new session: view, add to cart and begin checkout; force refresh. Confirm 7/30/90-day reports and reset in staging. Reset affects active analytics/report coverage; historical archive tabs and external backups remain retained. Delete those separately only if intentional erasure is required.
6. After these checks, run `setupShopMaintenance()` once in the Apps Script editor and grant the trigger permission. It does not create duplicate triggers for your account. Use one owner account for installation. Run `getShopOperationalHealth()` and inspect its log. Observe the first maintenance run; compare archived rows and source counts. Trigger setup is NOT performed automatically by this ZIP.
7. Repeat the smoke checks on the live release with controlled shop-approved test data. No real orders, live scripts, triggers or messages were created during preparation.

## Rollback / recovery

- For UI regressions, restore the prior website ZIP and matching prior Apps Script deployment version. Keep frontend/backend versions paired.
- Disable the `maintainShopAnalytics` trigger before maintenance troubleshooting. Archive rows are preserved; do not copy them back into the live sheet indiscriminately or analytics may count them twice.
- Do not overwrite the live spreadsheet with a pre-release backup after real orders have arrived. Preserve new orders, transaction journal, promo usage, inventory and OrderItems; reconcile affected rows in a staging copy first. Restoring an old sheet without reconciliation can duplicate orders or undo stock changes.
- A failed archive verification leaves source rows in place. Fix the archive/schema problem and rerun; stable IDs prevent duplicate copies. Existing malformed/duplicate columns are not destructively cleaned automatically.
- Old software does not understand the new costKnown flag. If reverting backend accounting, do not trust its profit display for newly created unknown-cost rows.

## Verification and performance expectations

`node scripts/run-checks.mjs` passes build consistency and 19 regression programs. New executable fixtures cover legacy phone-hash eligibility, explicit zero versus missing costs, journal replay idempotence for item recording, cancellation status changes at lock acquisition, within-batch and distant retry deduplication, bad timestamps, reset races, and interrupted archive recovery. Existing checks cover checkout, static publishing, analytics metrics and mocked admin rendering. These are local/mocked tests, not live Google Sheets concurrency tests or visual browser certification.

Customer-facing JS/CSS payload is unchanged. Backend work should decrease for frequent dashboard reads because caches survive ingestion and schema calls are reduced. Uncached retries can cost more because duplicate lookup scans the full active ID column. Archival adds up to 24 bounded maintenance runs/day. Promo alias verification adds up to four historical-hash lookups when required. There is no measured percentage speedup, and no guarantee of zero breakage; staging and the smoke checks above are the release gate.
