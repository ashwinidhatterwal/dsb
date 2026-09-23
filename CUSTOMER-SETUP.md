# Customer accounts — setup and release gate

This build adds profile.html to the reliability + admin image-editor build. This release package enables accounts in config.js; deploy the matching Apps Script backend and its Script Properties before publishing the website. Guest shopping remains available. The original ZIP is the rollback build.

## What is included

- Optional Google sign-in, separate English/Hindi profile page, sign out.
- Editable name/mobile, up to five saved addresses, default address and checkout autofill when the checkout fields are empty. Customers can select another saved address and edit before ordering.
- Account-linked orders, ten per page, status, price breakup, historical address and payment method.
- Downloadable HTML order slips and browser Print / Save as PDF using the existing receipt generator. UPI slips explicitly do not confirm payment.
- Delete saved profile details/addresses after a recent sign-in. This does not delete Firebase identity or business order records. Account closure requests go to the shop.
- Local checkout/receipt details are cleared on sign-out. Unresolved checkout attempts are retained to prevent duplicate orders.
- No cart/history cloud sync and no automatic linking of guest or previous orders. Signing in after an order does not claim that guest order.

## 1. Firebase — owner setup

1. Done: Web app registered in Firebase project `dhatterwal-suhag-bhandar`. No Firestore, Storage, Functions or Hosting is required.
2. Done, per owner: Google provider enabled and support email set.
3. Done, per owner: `suhagbhandar.in` added to authorized domains. Add `www.suhagbhandar.in` only if the site is also served there. Add `localhost` only for testing when needed.
4. Done: The supplied Web app `firebaseConfig` values are already in `CONFIG.CUSTOMER_ACCOUNTS.firebase` in config.js. Keep Firebase's supplied authDomain. Do not substitute the shop domain without hosting the Firebase auth helper there.
5. `enabled: true` is set in this package. Do not publish the website before the matching Apps Script version and Script Properties are deployed; authenticated APIs would otherwise fail.

The public web config is not a service-account credential. Never put a service-account private key in this website. The Firebase Auth SDK is pinned to 12.12.1 and loaded from Google's CDN only for account use. Popup sign-in is intentional; no redirect/storage workaround is assumed. Test real mobile browsers and the installed PWA before enabling.

## 2. Apps Script — owner setup

Replace code.gs with this build's generated code.gs. Keep existing properties.
Add these Script Properties:

| Property | Value |
| --- | --- |
| CUSTOMER_ACCOUNTS_ENABLED | true |
| CUSTOMER_FIREBASE_PROJECT_ID | The Firebase projectId |
| CUSTOMER_FIREBASE_API_KEY | An API key for that same Firebase project usable by the server-side Identity Toolkit API request |

A browser-referrer-only key can fail from Apps Script. If the web key has browser referrer restrictions, use a separate server-compatible key restricted to the Identity Toolkit API in the same project for the Script Property. Do not loosen unrelated keys or paste this server key into client code.

Redeploy the existing Apps Script web app as a new version, preserving the current execution/access settings and URL. Customer APIs use POST with text/plain JSON, matching the existing cross-origin transport. No tokens are placed in URLs or Sheets.

Customers and CustomerAddresses sheets are created on the first successful save. CustomerUID and CustomerItems columns are added to Orders on the first authenticated order. Existing order rows are untouched. Do not add rows/columns manually unless repairing a schema.

## If the profile shows “Sign-in verification failed”

Google sign-in may succeed in the browser while Apps Script's `accounts:lookup` call fails. Firebase key restrictions can affect a server-side request differently from a browser request. In the same Google Cloud project, go to APIs & Services > Credentials and inspect the key used for the `CUSTOMER_FIREBASE_API_KEY` Script Property. If it permits only website HTTP referrers, create a separate API key for Apps Script: set Application restrictions to **None**, and API restrictions to **Restrict key** with **Identity Toolkit API** allowed. Put this separate key only in the Script Property; leave the `config.js` browser key as provided by Firebase. You may need to enable the Identity Toolkit API in the project. You do not need a service account or a new website ZIP for a Script Property change. If the key was changed, reload the profile and try again. The updated backend displays a short Firebase error identifier without exposing the ID token or key; report that identifier if the error persists.

## 3. Publish and verify

Publish the whole website ZIP, including .github, source modules and generated code. Run `node scripts/build.mjs` after editing backend sources, then `node scripts/run-checks.mjs`.

On a controlled preview or owner test deployment, set `enabled: true` and verify:

- Google popup login in Android Chrome, iPhone Safari and installed PWA; popup-blocked/cancelled behavior; reload persistence; sign out and account switching.
- Save/edit/delete addresses, leading-zero mobile number, PIN validation, empty-checkout default autofill, selecting another address, and preserving typed changes.
- A signed-in order appears in the correct account with correct historical prices; HTML slip downloads and Print / Save PDF works.
- A different Google account cannot see that order or address; second-device login retrieves saved details.
- Expired/revoked login and unavailable Firebase/API give usable errors; checkout can explicitly continue as guest with the SAME request ID.
- Guest purchase, interrupted checkout recovery, stock and cancellation work normally.
- Saved-details deletion requires signing in again if the session is older than five minutes, keeps order records, and removes local convenience details.

Publish the storefront after the backend is deployed, then run these live checks promptly. To disable, set the config flag false and publish again; to stop authenticated APIs too, set CUSTOMER_ACCOUNTS_ENABLED=false. Existing guest ordering remains available.

## Validation completed and limits

Automated checks cover syntax/build consistency, existing regression programs, identity/project/expiry/revocation checks, address ownership and retry idempotency, paginated order ownership, public order field filtering, saved-data deletion, and same-request guest fallback. Firebase, Sheets and checkout persistence are mocked in the new tests. They are not live certification.

Live Google login, real Apps Script writes, cross-device operation, and browser layout/printing remain release gates. This workspace's Chromium download failed, so no visual-browser pass is claimed. Initial guest pages do not load Firebase or call customer APIs. Signed-in requests currently perform one online token lookup each; this adds latency and Apps Script URL Fetch usage. Measure real devices/API timings during the release gate; no percentage performance claim is made.

## Code map

- customer-account.js: lazy Firebase bridge and authenticated POST transport.
- profile.html / profile.css / profile.js: customer profile interface only.
- src/backend/customers.gs: customer identity, profile/address storage and order reads.
- src/backend/checkout.gs + http.gs: verified UID and immutable public item snapshot on order creation.
- cart-ui-*.js: optional saved-address controls and explicit authentication fallback.
- scripts/check-customers.mjs + check-customer-checkout.mjs: account security and checkout integration regressions.

References: https://firebase.google.com/docs/auth/web/google-signin ; https://firebase.google.com/docs/reference/rest/auth ; https://firebase.google.com/docs/auth/web/redirect-best-practices
