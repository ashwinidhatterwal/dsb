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
