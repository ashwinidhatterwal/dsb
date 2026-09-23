> Historical stage notes; AUDIT-COMPLETION.md governs the current API 26 release.

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
