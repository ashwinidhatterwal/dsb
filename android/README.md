# Suhag Bhandar Android 1.0.1

Production source based on GitHub main `2c0820c` (fetched 17 October 2026). The approved Trusted Web Activity (TWA) architecture stays in place: the app opens the live shop at https://suhagbhandar.in/ through a compatible browser and uses the website's catalogue, accounts and checkout.

- Production identity: `in.suhagbhandar.app`, version **1.0.1**, version code **4**.
- Preview identity: `in.suhagbhandar.app.preview`, label **Suhag Bhandar**. Production installs separately from the preview.
- Android 7.0+ (API 24); compile/target API 36. Java 21, Gradle 8.13, AGP 8.13.2, Android Browser Helper 2.7.4.
- Existing DSB icon, brand colours and splash screen; optional monochrome cart icon for themed launchers. System status/navigation bars remain visible.
- No app background service or sensitive device permissions. The browser manages site sessions, downloads, website permissions and online connectivity.
- Shop/product URLs on the verified HTTPS host are covered by App Links, including legacy query links and generated product pages. Embedded browsers and the user's Android link preferences can affect where a link opens.

## Generate your signing key in Termux

Skip generation if you already have the key intended for this production app. Keep a private backup of the keystore and passwords. Do not commit or share them. The preview signing key is not used for production.

```sh
pkg install openjdk-21
mkdir -p "$HOME/dsb-keys"
keytool -genkeypair -v -keystore "$HOME/dsb-keys/dsb-upload.jks" \
  -storetype JKS -alias dsb-upload -keyalg RSA -keysize 3072 -validity 10000
```

Answer the keytool prompts. Use a strong password; using the same password for the key and keystore is supported. Export the keystore for the GitHub secret:

```sh
base64 < "$HOME/dsb-keys/dsb-upload.jks" | tr -d '\n' > "$HOME/dsb-keys/dsb-upload-base64.txt"
```

In GitHub repository **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Complete contents of `~/dsb-keys/dsb-upload-base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `dsb-upload` (or your existing alias) |
| `ANDROID_KEY_PASSWORD` | Key password; same as keystore password if you chose that |

The Base64 file is also private key material. Keep it out of the repository and messages. Passwords are supplied as environment variables, not build arguments or checked-in Gradle properties. CI restores the key only in its temporary directory and removes it even after a failed build.

## Build using GitHub Actions

1. Upload/extract this full source over your repo, including `.github` and `.gitattributes`, then commit and push to `main`.
2. Open **Actions → Build DSB Android app → Run workflow**. Select `main`, enable **Build signed production APK and Play Store AAB**, then run.
3. The checks job first runs all website regressions, certificate merge tests, Android unit tests for debug/release, debug assembly, and lint for both variants.
4. The release job signs the APK and AAB with your secrets. It rejects missing credentials; verifies both signatures, matching certificates, production identity/version, non-debuggable APK, Android API levels, expected permissions and App Links manifest entries.
5. Download **dsb-android-production**. It contains the release APK, Play upload AAB, R8 mapping, checksums, public certificate fingerprint, metadata and a candidate website association. Download within 14 days; back up mapping files alongside each published version.

If you extract over an existing checkout, remove the three retired paths as well (ZIP extraction does not delete old files). Run this from the repository root before committing:

```sh
git rm --ignore-unmatch UPLOAD-INSTRUCTIONS.txt \
  android/website-verification/assetlinks.preview.json \
  android/app/src/main/res/drawable/shop_icon.png
```

The shop bitmap is now included at `android/app/src/main/res/drawable-nodpi/shop_icon.png`.

Pushes/pull requests run checks without release signing secrets. Signed releases are manual and restricted to `main`. The workflow does not publish to Google Play or change your website association automatically.

Routine checks publish reports only. Download the installable APK/AAB from the explicit production job using your existing signing secrets. Production updates must retain the production package and signing identity; increase versionCode for each Play upload.

## Remove the URL bar and enable product links in production

This package includes the Play app signing certificate you supplied in `.well-known/assetlinks.json` for `in.suhagbhandar.app`, alongside the preserved preview association. Push the full source including `.well-known`, and wait for website deployment before testing the Play-installed app. Direct GitHub APK installs use the owner keystore certificate, which the release artifact can add using the merge process below.

For **directly installed release APKs**, copy the generated `assetlinks-direct-install.json` from the production artifact to the website root `.well-known/assetlinks.json`, then commit/push and wait for GitHub Pages deployment. That candidate contains the actual release certificate and preserves the existing preview association from this source revision. If associations have changed since building, use the merge command below on the current file instead of replacing it with an old candidate.

For **Google Play installs**, get the SHA-256 of the **app signing key certificate** from Play Console's App signing page. The upload key and the Play app signing key can differ. Add the Play certificate to the current file:

```sh
python android/scripts/assetlinks.py --package in.suhagbhandar.app \
  --sha256 'PASTE_REAL_PLAY_APP_SIGNING_SHA256' \
  --merge .well-known/assetlinks.json --output .well-known/assetlinks.json
```

Commit/push and deploy the website. The generator merges certificates and preserves other associations; it never invents a certificate. Only public fingerprints belong in this file. Verify https://suhagbhandar.in/.well-known/assetlinks.json returns the production package/certificate over HTTPS without redirects.

Install the relevant APK or Play test build and test its product links/no URL bar again. Android/browser verification can take time and be cached. Enable **Open supported links** in Android app settings. Third-party Google sign-in, UPI, WhatsApp and unrelated sites can legitimately open external apps or browser UI. Keep the previous test association until those installations are retired.

## Local build

Install Java 21, Android SDK platform 36 and build tools 36.0.0; set `ANDROID_HOME`.

```sh
cd android
bash gradlew :app:testDebugUnitTest :app:testReleaseUnitTest :app:assembleDebug :app:lintDebug :app:lintRelease
```

For release, set `ANDROID_KEYSTORE_PATH` (absolute path), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` in your private environment, then run:

```sh
bash gradlew :app:assembleRelease :app:bundleRelease
python3 scripts/verify-release.py
```

No production signing key or private signing values are included in this source. Local unsigned release packaging is intentionally blocked. Unit tests/lint remain usable without a key.

## Final phone acceptance and store setup

The owner has confirmed the preview app works. Before public release, test the actual production-signed APK or Play test build: cold launch/relaunch, product link entry, both languages, search, cart, address/account restoration, UPI handoff and return, COD quote, receipt download/print, WhatsApp, back navigation, keyboard, rotation, offline/retry. Check the app on an Android 9 device as well as the current phone if available. Unit tests cannot verify a real bank app or browser OAuth handoff.

The website backend must serve the intended checkout policy: UPI recommended/default, COD surcharge ₹50. `clasp push` alone does not update an Apps Script web-app deployment; deploy a **New version** on the existing deployment if its live fee ever remains ₹20 after a future source update. The live endpoint was checked during this audit and returned `codCharge: 50`. This app always uses the live website/backend.

Use Play App Signing for the AAB. Complete the Play listing, real screenshots, store/privacy/contact links, content rating and Data safety disclosures based on the website's real collection (accounts, address/orders, analytics and third-party services). Website-based packaging does not remove those disclosures. No automated Play submission is configured.

See `VALIDATION.md` for checks actually completed and remaining owner-dependent release steps.
