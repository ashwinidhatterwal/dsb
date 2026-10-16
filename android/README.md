# Suhag Bhandar Android app — preview 0.1.1

This is the approved website-based Android app, built with Google's Android Browser Helper and a Trusted Web Activity (TWA). It opens `https://suhagbhandar.in/` using a compatible browser. A verified TWA hides the browser address bar, while retaining system status/navigation bars. On an unverified installation or unsupported browser, Custom Tabs/browser UI can appear.

## Current build

- Website baseline: `ashwinidhatterwal/dsb`, commit `f754844ec301f131d40223c5013227d6f5fddcec`.
- Display name: **Suhag Bhandar Test** (preview); existing DSB shop icon and colours.
- Preview application ID: `in.suhagbhandar.app.preview`.
- Provisional release ID: `in.suhagbhandar.app` — owner approval required before production release.
- Android 7.0+ (API 24); target/compile API 36.
- AGP 8.13.2, Gradle 8.13, Java 21 for startup tests (Java 17 is sufficient for build-only), Android Browser Helper 2.7.4; wrapper distribution SHA-256 pinned.
- Website UI controls Hindi/English, shopping, accounts and checkout. No copied catalogue or separate backend.
- No background sync, notification, contacts, location or storage permission added. Internet is the only requested app permission. The browser handles website permissions and sessions.
- Shopping requires internet, as it does on the current website. No offline checkout added.

## Build

Install Java 21 and Android SDK platform 36/build tools 36.0.0. Set `ANDROID_HOME` or a local `local.properties` containing `sdk.dir=/your/sdk/path`.

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. A manual GitHub Actions workflow is supplied at `../.github/workflows/android-app.yml`. CI-generated debug APKs use a different debug certificate unless a persistent test signing key is deliberately configured; do not expect them to update an APK built on another machine.

`./gradlew :app:bundleRelease` builds an **unsigned** release bundle. This is not a Play Store upload artifact. Production signing, final app ID, Play App Signing and store submission require the owner's next decision. No production keystore has been created or included.

## Website verification — deployment required

Fullscreen trust requires a public HTTPS file at:
`https://suhagbhandar.in/.well-known/assetlinks.json`.

The supplied preview association must match the exact APK's signing certificate and application ID. The candidate file is supplied under `website-verification/` and the website root `.well-known/`. It is prepared for review, not deployed by this package.

Inspect an APK using the Android SDK:

```sh
apksigner verify --verbose --print-certs app-debug.apk
```

Generate a matching public association:

```sh
python3 scripts/assetlinks.py --package in.suhagbhandar.app.preview \
  --sha256 ACTUAL_APK_CERTIFICATE_SHA256 \
  --output ../.well-known/assetlinks.json
```

The publishing script now copies only this association from `.well-known`. It continues excluding Android source, keys and other subdirectories. When moving to Play Store, use the **Play app signing certificate**, not the upload certificate, in the production association. Preserve any existing statements when adding another app/certificate; the generator creates a single-app file and does not merge an existing file.

The small `pwa-install.js` change suppresses the install banner inside the installed app. Web pages have an updated version query for that script. No backend deployment is required.

## Phone acceptance checklist

After verification is published, install the provided APK with an updated TWA-capable browser (Chrome is the primary test target). Verify the public association contains the exact APK certificate and has no redirects/sign-in wall. Browser verification can be cached; clear the site's verification state/reinstall if necessary.

Check: cold launch and relaunch; no address bar on shop pages; product links open the right item; Hindi/English; search/filter/cart; Google sign-in and restored account; default address; guest checkout; UPI app launch and return; WhatsApp; receipt download and print; back navigation; rotation/keyboard; lost internet and retry. Do not place chargeable real orders without the owner's test instruction. Third-party Google/UPI pages may correctly display browser or external-app UI.

Passing compilation, lint and website regression checks does not prove live payment/login behaviour. This environment has not completed Android device acceptance. No Play Store approval claim is made.

## 0.1.1 startup fix

Registered Android Browser Helper’s ManageDataLauncherActivity, which LauncherActivity enables/disables during startup on Android 7.1+. The earlier manifest omitted it. Added six Robolectric checks across API 35 and 36 for required component registration, activity startup without a browser, and splash rasterization. API 36 tests need Java 21 and the configured JVM module access flags. These tests simulate Android; a physical-device check remains required. The APK retains the previous signing certificate and preview application ID, allowing installation as an update.

## Website checkout update — 16 October 2026

The website root now builds on GitHub main `cf7c38a385fb2287a3ebb5edc7aad093de8c49f7`. See `../RELEASE-COD50-UPI.md` for the ₹50 COD/UPI checkout deployment. Android 0.1.1 code and signing identity are unchanged; existing App Links support already covers shared product URLs. No APK rebuild is needed.
