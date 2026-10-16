# DSB checkout update — 16 October 2026

Website baseline: `ashwinidhatterwal/dsb` main at `cf7c38a385fb2287a3ebb5edc7aad093de8c49f7` (including restored website icons and published Android verification).

## Changes

- Server-authoritative COD surcharge is now **₹50 per order**, in addition to any applicable delivery fee. UPI has no COD surcharge.
- UPI remains selected when a fresh checkout opens and is marked **Recommended**. A customer can choose COD; cart rerenders preserve that explicit selection.
- COD shows its live extra charge beside the option; UPI shows the corresponding saving. Fee amounts come from the backend, so the interface cannot disagree with the deployed policy.
- New fee wording supports Hindi. Changed frontend assets have fresh cache-busting versions.
- The generated root `code.gs` and `style.css` match their maintained source modules.
- Historical order receipts continue to display their saved charges. Existing ₹20 fixtures are intentionally retained to verify old-order rendering.

## Activate the payment change

1. In the existing Google Apps Script project, replace the combined script with this package's root **code.gs** and save.
2. Choose **Deploy → Manage deployments → Edit the existing web app → New version → Deploy**. Keep the existing deployment URL, Script Properties and spreadsheet binding. Do not create a replacement endpoint.
3. Update the website repository with this complete package, preserving `.github`, `.well-known` and all image files. Do not delete the current icons when copying files. Publish after the backend deployment.
4. Wait for the website publishing workflow to finish. Open a fresh cart and confirm UPI is selected with Recommended, COD shows ₹50 extra, and switching payment method changes the total by ₹50. Below the existing free-delivery threshold, delivery is separate.

The live fee changes only after Apps Script is redeployed. The ₹50 is not a frontend-only display adjustment. No live order or payment was made during verification.

## Shared product links

The existing **0.1.1-preview APK already contains verified Android App Links** for all HTTPS paths on `suhagbhandar.in`, including `product.html?id=...` and generated `products/...` pages. No new APK is required for this release.

On 16 October the website association returned HTTP 200 with the installed preview application's certificate, and Google's Digital Asset Links check returned `linked: true`. This confirms the public association; it does not inspect an individual phone's verification cache or default settings.

On Android, ensure **App info → Suhag Bhandar Test → Open by default / Opening links → Open supported links** is enabled for `suhagbhandar.in`. If a link is kept inside another application's built-in browser, use that application's external-open option. With no app installed, product links still work as normal website links. Keep the current installed APK; newly built CI debug APKs can have a different certificate.

The `android/` folder preserves the working 0.1.1 app source and its startup fix. No new app identity or production signing key has been selected.

## Validation

- `node scripts/run-checks.mjs`: build consistency and **32 regression programs passed**.
- New executable checks exercise actual backend quoting at different cart totals, zero UPI surcharge, ₹50 COD surcharge, stale ₹20 quote rejection, actual cart rendering with UPI recommended/default, explicit COD choice retention and no-UPI fallback.
- App Links manifest scope and matching published association are checked. No Android device launch test was repeated for this website-only update.
- The complete archive includes all seven restored website images. No backend credentials, signing key or build cache was added.

GitHub write access was denied earlier in this session; this is a validated source handoff, not a claim that the payment update has already been deployed.
