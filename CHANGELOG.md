# Changelog and historical release notes

This file consolidates superseded release-specific notes so the full checkpoint stays self-contained without carrying several overlapping Markdown files. Current operating/setup guidance lives in `SETUP.md`, `CUSTOMER-SETUP.md`, and `MAINTENANCE.md`.

## 24 September 2026 — legacy AI fallback removed

- AI provider/model selection now comes exclusively from **Admin → AI configuration**.
- Removed runtime fallback to `AI_API_KEY`, `OPENAI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `OPENAI_MODEL`, `AI_API_TYPE`, `AI_IMAGE_DETAIL`, `AI_MAX_OUTPUT_TOKENS`, and `AI_REASONING_EFFORT`.
- Current configuration remains stored in `AI_CONNECTIONS_JSON_V1` plus per-connection `AI_CONN_KEY_*` secrets.
- Product AI and DSB AI now fail clearly when no enabled configured model exists instead of silently falling back to stale Script Properties.
- Updated tests and setup/maintenance guidance to prevent the legacy path from returning.

## 24 September 2026 — maintainability and package cleanup

- Kept one complete source/checkpoint package rather than splitting source and deployment bundles.
- Removed the obsolete `customer.saved.delete` compatibility endpoint and its stale regression path; full account closure remains `customer.account.delete`.
- Replaced duplicated Product AI / DSB Admin AI provider adapters with the shared `callAiStructuredJson_` transport while preserving both Responses and Chat Completions modes, Gemini image handling, structured JSON, reasoning fallback, and provider compatibility fallback.
- Renamed historical CSS modules to responsibility-based names without changing the compiled cascade order.
- Removed an unused cart tracking redirect helper pair. Dedicated tracking remains on `track-order.html` and the Thank You page.
- Palette-optimized the PWA/app icons and social sharing card at unchanged dimensions to reduce package and public asset weight.
- Consolidated prior release-specific Markdown files into this changelog and replaced accumulated QA text artifacts with `qa/verification-latest.txt`.
- `node scripts/run-checks.mjs` passes build consistency and all 27 regression programs after cleanup.

## Audit completion — 23 September 2026

# Audit implementation release — 23 September 2026

This API 26 release builds on `dsb-audit-stage-3-ui-security.zip`, preserving the category-card height fix and the previous correctness/reliability work. It is a tested source package, **not a deployed or fully live-certified website**. The original audit's source-only caveat still applies to account configuration, live capacity and visual acceptance.

## Requested changes

- **Owner key:** existing nonempty `ADMIN_KEY` works without a 24-character minimum. The literal setup placeholder remains rejected. Invalid-attempt throttling remains; valid owner keys are not blocked by those failed-attempt counters. Optional staff keys keep their pre-existing rules. No owner key was changed.
- **Uploads:** restored 15 MB input handling and existing resizing; removed the separate 5 MB prepared-image cap. Legacy unsigned uploads skip the extra authorization request. Signed uploads remain optional when configured. Cloudinary's own limits still apply.
- **UTM generator:** Admin → menu → Shop tools. Select a product or paste a shop URL, enter source/medium/campaign, optionally content/term, then generate, preview or copy. Existing product ID/size parameters survive; Hindi and special characters are encoded. Only this shop's HTTPS destinations are accepted. Generation itself is local.
- **Shipment details:** expand an order to save carrier, reference and an HTTPS tracking link. Customer order tracking displays these after the existing phone verification. Stale saves are rejected; no notification is automatically sent.
- **Optional size quantities:** enable sizes and enter, for example, `S=3, M=0, L=2`. List every size, including zero. The backend calculates the total, validates each size at checkout, and restores the ordered sizes on cancellation. Products with an empty size-stock field retain shared stock. Do not remove/rename sizes used by unresolved orders or change their inventory mode without reconciling them first. If historical size identity cannot be recovered, cancellation/reactivation stops for manual reconciliation rather than guessing.
- **Product reels:** optional Instagram post/reel link in the editor, displayed as a normal product-page link. No embed, autoplay or additional Instagram script is loaded.
- **Forget checkout details:** clears the remembered customer fields and current checkout quote on this browser. It does not erase orders, receipts or an uncertain order's recovery identity.
- **Custom analytics dates:** dates within the last 90 calendar days, using the shop time zone. Historical end dates exclude the following midnight and show completed-day coverage. Custom reports bypass cached preset reports. Existing table/CSV export remains.
- **Operations:** on-demand recovery/Telegram age, maintenance status, backup time, payment-record totals, unknown-cost coverage, daily activity and recent request timing samples. Sampled p50/p95 are best effort, not a capacity guarantee; requests killed by the platform cannot report their duration.
- **Publishing:** the served build includes its preparation/snapshot timestamps and a link to the repository's manual publishing workflow. This is not an automatic webhook from product editing and does not claim the exact deployment-completion time.
- **AI:** at most two products per analysis batch, four provider HTTP calls per request, and a 75-second soft budget checked before starting calls. Continuation preserves remaining IDs and instructions and creates reviewable proposals. Provider/model error context and available token usage are shown. In-flight Apps Script network calls cannot be forcibly cancelled; this is not a hard 75-second timeout. Token totals may be partial and are not a currency estimate. No new autonomous writes/payments are enabled.

## Audit closure matrix

| Audit items | Current disposition |
|---|---|
| A01–A08 — metric definitions, attribution, dates, ranking, GA item data | Earlier fixes retained; output fixtures and time-zone/DST tests pass. |
| A09–A11 — reset races, retries, approximate event ingestion | Earlier reliability fixes retained and regression-tested. Analytics remains approximate; do not interpret it as an exact accounting ledger. |
| C01–C03 — phone identity, unknown cost, cancellation concurrency | Earlier fixes retained and tested. |
| C04 — stock per size | Optional implementation added; shared mode retained. Checkout, recovery, cancellation and reactivation fixtures pass. |
| C05 — payment/refund visibility | Outstanding unverified value and recorded refunds added. Refund status remains a manual record; there is no bank transfer or partial-refund ledger. If an existing refundedamount cell is supplied it is used; otherwise refunded order total is shown. |
| S01 — privacy | Corrected policy retained, including third parties and local browser storage. Live configuration still needs owner verification. |
| S02 — uploads | Optional signing retained; prior browser limits restored as requested. Account-side preset limits/alerts are an external setup task. |
| S03 — key setup | Owner length enforcement deliberately removed at your request. Server permissions and failed-attempt handling retained. Rotation remains optional through Script Properties. |
| S04 — moderation | Queue, owner approve/hide, verified/legacy compatibility and neutral rating policy retained. |
| S05 — backups/retention/recovery | Forget-details control, editor-only spreadsheet backup helper and restore/deletion procedure included. Trigger authorization and a real restore drill remain open. |
| P01 — lock contention | Earlier shorter event critical section retained; quote/order/admin write-lock wait sampling added. Actual contention must be measured on staging. |
| P02 — retention/rollups | Earlier recoverable raw-event archival retained; daily aggregates added. Multi-day reports still calculate unique visitors from retained raw events; daily uniques are never summed. Orders/items still require full reads. |
| P03 — pagination | Existing bounded output retained. Indexed reads/database migration remain conditional on measured need, as the audit recommends. |
| P04 — operational measurements | Health and recent timing samples added. Real burst tests, unreturned timeout rates and capacity certification remain external acceptance work. |
| U01–U03 — keyboard actions, labels, chart values | Previous edits retained; new fields have labels; size picker now traps/restores focus. Source/mock-DOM checks pass. Full assistive-technology testing remains open. |
| U04 — hierarchy/mobile | New secondary tools use expandable panels; category-card CSS unchanged. No broad CSS consolidation without visual evidence. Real viewport, zoom and keyboard acceptance remains open. |
| D01 — discovery | Existing generator/feed retained. Merchant Center/Search Console diagnostics and approval cannot be verified from this package. |
| D02 — size-price feed | Keep one feed item per product. It now links to the cheapest available selected size; per-size structured offers reflect stock. Advertising every size as a separate feed variant is deliberately not enabled without Merchant validation. |
| D03 — snapshot/publication | Served build metadata and controlled manual-workflow link added. Edits still become static pages on the existing publishing schedule/manual run. |
| D04 — reel links | Optional validated field and lightweight public link added. |
| D05 — Hindi | Existing fallbacks retained; new storefront strings translated. Real long-content/Hindi browser acceptance remains open. |
| D06 — AI | Soft budget, smaller resumable batches, token usage and provider errors added. Live provider duration/billing checks remain external. |

The audit's deferred items remain deferred: framework rewrite, forced customer accounts, loyalty, complex colour/combo variants, more tracking, automatic payments and unrestricted AI. No module was removed solely to reduce file count. `src`, checks, publishing workflow, generated deployment files and attribution notice remain included.

## Measured package impact

Same local gzip-budget script, previous Stage 3 versus this package; KiB rounded to one decimal:

| Page | Stage 3 | This release | Change |
|---|---:|---:|---:|
| Home | 73.5 | 74.2 | +0.7 |
| Product | 76.6 | 77.5 | +0.9 |
| Catalogue | 68.8 | 69.5 | +0.7 |
| Admin | 74.2 | 78.0 | +3.8 |

All checked pages remain below the existing 90 KiB local JS/CSS gzip budget. These figures exclude product photos, third-party downloads, network latency and execution cost; they are **not** measured speed changes. Normal shopping gains no new API request or media embed. The health panel performs extra sheet reads only when refreshed; custom reports perform fresh reads; daily rollups and optional backups add scheduled backend work. Smaller AI batches bound per-request work but do not promise a lower total bill across a whole catalogue.

## Install and acceptance

1. Keep the previous ZIP and copy the bound spreadsheet. Separately preserve Apps Script source, deployment version and private properties. Do not put keys in the repository. Test first with a staging spreadsheet/API.
2. Replace Apps Script code with generated `code.gs`, save, and update its web-app deployment. Keep the existing owner key. API 26 also answers older v24/v25 admin-session requests during publication; the new admin checks for v26.
3. Publish the complete website package through the existing GitHub Pages workflow. Keep `src` and scripts in the repository; the publishing script excludes backend/guide files from the served site. Confirm the workflow's `node scripts/run-checks.mjs` gate succeeds.
4. In the Apps Script editor, run `setupShopMaintenance()` once to ensure maintenance plus the new daily rollup trigger; it is idempotent. Run `rebuildShopDailyAnalytics()` if immediate totals are wanted. Do not publish these helpers as public endpoints.
5. If scheduled backups are wanted, run `backupShopData()` once, authorize Drive access and verify the copy. Then run `setupShopBackups()` once. Copies are private under the executing account and are not automatically expired. Review storage/retention periodically. Backups briefly pause application writes under the script lock; use a quiet period. Manual spreadsheet edits are not covered by that lock.
6. On staging, test login with the current key; one image upload; a product save; a product UTM link; shipment update/stale edit; shared-stock checkout; sold-out-size rejection; multi-size checkout; retry of the same request; cancellation and reactivation. Keep production AI, Telegram and payment destinations out of staging tests.
7. Test 360/390/412px phones, 768px tablet and desktop, keyboard, 200% zoom, reduced motion and offline/retry states. Use long Hindi names and inspect cart, product, analytics, editor and tools for covered controls/overflow. A browser binary was unavailable here; these are outstanding checks, not reported passes.
8. Inspect Cloudinary presets/alerts, Merchant Center and Search Console in the owner accounts. Check feed prices, selected size and images against the deployed landing pages. Observe Apps Script executions for real timeouts/errors and health samples for p50/p95 and busy rates; compare current/larger staging datasets before making a traffic-capacity promise.

Do not enable size-specific inventory in production until steps 6–7 pass. Backend/source tests reduce risk; they cannot guarantee a live website will never break.

## Restore and deletion procedure

- **Restore drill:** use a copied spreadsheet and separate staging script. Restore Products, Orders, OrderItems, OrderTransactions and related promotion/analytics tabs together, preserving IDs and commit markers. Restore private settings separately. Run transaction recovery on the copy, inspect pending rows, and check a known order/stock balance plus retry/cancel paths before switching any production deployment. Never overwrite live commerce data with a stale backup while orders continue arriving.
- **Rollback:** UI-only rollback is possible with the compatible backend. If size inventory has been used, do not deploy an older backend that cannot update it. Restore a matched website/backend/data set during a controlled pause, or reconcile size inventory explicitly first. Stop newly installed backup/rollup triggers if reverting their helpers.
- **Customer deletion request:** verify the requester through the shop's existing order/phone process. Identify linked order and recovery records. Remove/redact permitted customer details on a protected copy first, while retaining required financial records, stable transaction identities and inventory facts. Check promotion history, notification destinations, stored AI context and private backup copies; do not claim instant deletion from external services/backups. Record the action and applicable retention decision. This package does not perform bulk deletion automatically.
- **Browser-only cleanup:** the new forget button removes saved checkout contact fields from this browser; it is distinct from a server-side deletion request.

## Verification performed

`node scripts/run-checks.mjs` passes build consistency and all 22 regression programs. Coverage includes previous analytics/phone/cost/recovery/moderation behaviour, new per-size limits and absolute stock recovery, cancellation/reactivation, shipment stale edits/roles, UTM encoding/host validation, AI budgets/remaining IDs, custom-date boundaries, feed selected-size price and frontend per-size cart limits. The full log is `qa/verification.txt`.

No production orders, messages, deployments, Cloudinary settings or external account changes were made. This document supersedes older release instructions where owner-key/upload limits differ.

## Reliability follow-up — 23 September 2026

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

## Phase 2/3 release

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

## Audit Stage 3

> Historical stage notes from the former Stage 3 release file. Current guidance lives in `MAINTENANCE.md`; this section is retained for history.

# Audit Stage 3: admin UI, accessibility, reviews and uploads

Build on `dsb-phase-2-3-complete.zip` (the build with your fixed category cards). Storefront card CSS has not changed. Backend API 25 includes a v24 admin-session compatibility response for a gradual website publish.

The admin analytics product table now has an actual keyboard-operable Edit product button. The trend chart has a collapsible dated value table and a CSV download. Connection and product-editor labels are associated with their fields; reset returns keyboard focus to its trigger. Review moderation has an owner-controlled Reviews page with Pending, Approved and Hidden states. Unverified new reviews wait for approval; verified new reviews may appear immediately; older unmarked reviews remain approved. Public lists and rating totals exclude pending/hidden reviews. The moderation menu accepts any star rating and warns staff against hiding criticism just for being negative.

The current release restores 15 MB inputs and removes the separate prepared-image cap. When Cloudinary API credentials and a separate signed upload preset are installed in Apps Script Script Properties, the authenticated backend signs each upload; until configured, the old unsigned preset remains for compatibility. **Unsigned requests can bypass browser limits**; set Cloudinary account-side format/size/overwrite restrictions and usage alerts, then disable the old unsigned preset after confirming signed uploads in staging.

## Safe order for staging and production

1. Copy the working spreadsheet, Apps Script source/properties, Cloudinary preset settings and current website ZIP. Never paste credentials into repository files. The current release keeps the existing owner key without a new minimum length.
2. Deploy the new generated `code.gs` into a **staging** Apps Script project, using its staging spreadsheet. The existing admin can connect to this backend as v24 while static assets publish. Test checkout retry/stock and the Phase 2/3 analytics paths on the staging copy.
3. Publish the new website/admin files and restore the matching endpoint settings if your staging setup uses different URLs. Sign into the new admin; it negotiates API 25. Verify keyboard Tab/Enter access to product edits; exact chart values/CSV; label click and reset-dialog focus. Test at 360, 390, 412 and 768 px, desktop, 200% zoom, Hindi and reduced motion. No real-browser certification was possible during packaging.
4. Submit an unverified staging review, check that it does not show in product lists or summary, approve it and verify visibility, then hide it and confirm removal. Test a delivered-order verified review, and hide an older published review. Check the Review page is read-only for viewer/editor accounts and write access is owner-only.
5. In the Cloudinary test environment, restrict the existing unsigned preset. Optionally create a signed preset; configure Script Properties `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_UPLOAD_PRESET`, and `CLOUDINARY_CLOUD_NAME` if needed. Test both main and additional photo uploads from an editor account. Once both pass on the live backend, disable the former public preset. This account change is manual and not done by the ZIP.
6. Move the verified backend and site to production in the same order. The v24 compatibility response keeps an older admin operable while the static update propagates. Observe pending reviews, upload usage and backend errors after launch.

## Rollback

- Restore the paired previous ZIP and previous Apps Script deployment version if a problem appears. Existing reviews with a new `moderationStatus` column remain in the spreadsheet. The older backend ignores that column and **may publish pending/hidden reviews**, so do not roll back the backend alone after moderation begins. If a rapid rollback is needed, preserve the new backend review filter or pause the public review endpoint until reconciled.
- If a signed upload fails, keep the old unsigned preset active temporarily while you diagnose the signed preset and account restrictions. Never move the Cloudinary API secret into client code.
- Do not overwrite production sheets with staging copies after real orders or reviews are added. Compare and reconcile the journal and review records instead.

`node scripts/run-checks.mjs` passes build consistency and 21 local regression programs, including moderation visibility, version negotiation, signing, escaped review text and existing checkout/analytics checks. These are isolated checks; they do not certify live browser layout, Cloudinary settings, real Google Sheets concurrency or a deployment. Admin assets rise modestly to accommodate the chart table and moderation page; storefront photo and category CSS remains unchanged.
