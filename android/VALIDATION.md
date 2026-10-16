# Production release validation — 16 October 2026

## Source and changes

- Latest GitHub main fetched and rechecked: `fa7aa23` (`Set COD fee to 50 and recommend UPI`). Production changes are supplied in this full source package; they have not been pushed or deployed by this audit.
- App release: **1.0.0**, version code **3**, package **in.suhagbhandar.app**. The existing preview remains a separate package.
- Retained the working TWA architecture, startup component registration, HTTPS-only shop host, full product-link scope, existing normal shop icon and website features.
- Added environment-based mandatory release signing, manual main-branch release job, signed APK/AAB artifacts, artifact signature/identity/permission checks, checksums, mapping files and public certificate output.
- Pinned GitHub Actions to resolved commit SHAs, restricted token permissions, prevented credential persistence during checkout and removed the temporary signing key after release jobs. Pull request/check builds do not receive production signing secrets.
- Added explicit cloud/device-transfer exclusions, monochrome themed icon, proper bitmap resource placement, and line-ending/credential/build-file ignore rules.
- Replaced obsolete preview instructions and removed their duplicate association file. The live preview statement in root `.well-known/assetlinks.json` remains intact. Production certificates must be merged after the owner's real signing key is available.

## Completed verification

- `node scripts/run-checks.mjs`: build consistency plus **32 website regression programs passed**. These use isolated fixtures/mocks and sent no real orders or messages.
- Certificate generator regressions passed: preserve existing preview/web statements, append production certificates, avoid duplicates on repeated updates, preserve files on invalid certificate input.
- GitHub workflow validation with **actionlint 1.7.7** passed. Python syntax checks and `git diff --check` passed.
- Android debug and release unit tests run on simulated API **24, 28, 35 and 36**. Coverage: startup with no compatible browser, settings component registration, splash and launcher icon rasterization, product URL routing, preservation of path/query, rejection of unrelated HTTPS launch URLs. **56 checks passed**: 28 debug and 28 release, with zero failures/errors.
- Debug APK assembly and lint for both variants passed. Lint has **0 errors, 5 cosmetic legacy launcher-icon shape warnings**: the five existing Android 7 PNG density variants retain the original full-background brand artwork. Modern adaptive/themed icons are configured. No lint issue was suppressed.
- Real `bundleRelease` with no signing credentials failed at `validateProductionSigning`, as intended.
- Actual signed `assembleRelease` and `bundleRelease` succeeded, including R8/resource shrinking, using a **disposable local verification key**. This is not the owner's production key; these local APK/AAB files are not distributed in the source ZIP.
- `verify-release.py` passed against both actual signed outputs: APK verification, AAB verification, matching signing certificate, release identity/version, non-debuggable state, expected API levels and permissions, required App Links components, disabled cleartext and backup flags.
- Local verification APK: approximately **673 KB**; AAB approximately **936 KB**. Owner signatures/build metadata may change these sizes slightly. No native `.so` libraries are packaged.
- Live Apps Script checkout config was read during the audit and returned `codCharge: 50`, `deliveryCharge: 40`, `deliveryFreeAbove: 499`.

## Owner-dependent release steps

1. Generate/retain the permanent private signing key and add the four GitHub Secrets described in `README.md`.
2. Push this source and run the manual production workflow on `main`. No Play upload or website association publication is automated.
3. Add the actual release APK certificate to the current website association for direct installs. For Google Play, also add the **Play app signing certificate**; it can differ from the upload certificate. Preserve existing statements.
4. Test the actual production-signed/Play-installed build on a phone: no URL bar on the shop, product-link entry, account/address restoration, UPI handoff/return, COD, receipts/printing, WhatsApp, back/keyboard/rotation and offline/retry. The owner confirmed the preview works; this audit does not claim physical-device acceptance of the new production identity or a real payment.
5. Complete Play listing, privacy/Data safety and testing/review requirements. No Play acceptance or universal device compatibility is claimed.

Production readiness here means that source/build/signing checks are in place and verified; the owner's actual signing certificate and phone acceptance remain required before public rollout.
