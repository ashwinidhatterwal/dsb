# Guest-only website release — 17 October 2026

Baseline: latest fetched GitHub main `bcdc1c1` (DSB update 2026-10-17 09:34).

This complete package removes customer registration/sign-in, the account/profile page, saved-account address picker, Google/Firebase client SDK configuration and loading, customer identity verification/profile/address/order-list endpoints, order-to-account linkage, and the admin customer-account directory. The old account-only scripts, styles, backend module, setup guide and three obsolete test suites are deleted. Public pages and the generated product-page template contain no customer account links or labels. The store-owner workspace retains its existing key protection and uses a Disconnect button.

Shopping, browser-saved delivery details, delivery PIN validation, UPI/COD, promotions, stock/size checks, order retry/recovery, receipt downloads, order tracking/cancellation requests, analytics and product/admin tools remain. The API still validates order prices, stock and request IDs server-side. COD stays ₹50 extra, and UPI remains the default/recommended payment option. New orders do not create account ownership columns or write customer profiles. Existing store orders and stored personal data are not erased by this source update.

## Install into the existing website repository

1. Extract the whole `dsb-main` folder over your current checkout. Include `.github`, `.well-known`, and the release's `scripts/retired-customer-files.json` file.
2. From the repository root, run:

```sh
node scripts/remove-retired-files.mjs
node scripts/run-checks.mjs
git add -A
git commit -m "Remove customer accounts and keep guest checkout"
git pull --rebase origin main
git push origin main
```

The first command deletes only the eleven retired source/doc/test files listed by this release. ZIP extraction alone does not remove old files; do not skip it. It does not touch your spreadsheet, keystore or store configuration. `git add -A` records those deletions as well as the new files. If rebase reports a conflict, resolve it before pushing; do not force push.

3. Deploy the generated **code.gs** to the existing Apps Script project using your existing `dsbscript` shortcut, or copy/push it from `~/myscript` as before. Then open **Deploy → Manage deployments → Edit → New version → Deploy** on the same web-app deployment. Keep its current public access settings and URL. `clasp push` alone does not update the live deployment.
4. Wait for **Update sitemap and deploy shop** to succeed in GitHub Actions. Refresh the website/close and reopen the Android app. Changed storefront/admin assets have fresh cache versions. Guest checkout also works during the transition with the preceding backend, but backend deployment is necessary to retire the account API completely.

The website-based Android app loads this website update. **No new APK/AAB is required** for removing the account feature. This package retains the current Android project/version and Play signing association.

## Existing account-only data and settings

The replacement backend does not read the old `CUSTOMER_ACCOUNTS_ENABLED`, `CUSTOMER_FIREBASE_PROJECT_ID` or `CUSTOMER_FIREBASE_API_KEY` Script Properties. You may delete these three unused properties after deploying. Keep all unrelated order, quote-signing, Telegram, Cloudinary and admin properties.

The old `Customers`, `CustomerAddresses` and `CustomerAccounts` spreadsheet tabs and existing Firebase Authentication identities are not deleted automatically. Preserve order/transaction/promotion sheets. If you want to erase old account-only personal data, back it up and do that separately according to your retention decisions; no destructive data operation is bundled here.

## Checks for this release

- Build consistency and all **30 current regression programs pass**. Three removed account-only suites were replaced by a guest-checkout/removal regression suite.
- Checks cover guest submission without token SDKs, stale-token compatibility, stable retry IDs, absence of account ownership writes, no retired files/links/imports/UI, protected admin actions, ₹50 COD/default UPI, existing stock/order/tracking/cancellation behaviours, static product generation and frontend asset references.
- Freshly generated `code.gs` uses 24 maintained backend source modules; style/admin bundles match their maintained sources.
- Visual browser verification could not run in this environment: Chromium was blocked by an OS socket permission restriction before opening a page. The automated regression checks above passed; no live browser result is claimed. No production orders or messages were placed.
