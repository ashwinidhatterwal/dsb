# Preview validation — 16 October 2026

- Baseline fetched directly from GitHub: `f754844ec301f131d40223c5013227d6f5fddcec`; it matched the live site's publication metadata at retrieval.
- `node scripts/run-checks.mjs`: **passed**, build consistency plus all **32 regression programs**, including an isolated publishing run for the Android association. No real orders/messages were sent.
- `:app:assembleDebug :app:lintDebug`: **passed** with Java 21, SDK 36 and Gradle 8.13. Lint: **0 errors, 8 warnings** (backup configuration recommendation, legacy launcher shape, optional monochrome icon and bitmap density location).
- `:app:bundleRelease`: **passed**, including resource shrinking/R8 and release vital lint. Output is deliberately unsigned; no production signing identity selected.
- Test APK: `DSB-Android-0.1.1-preview.apk`, **4,975,513 bytes**.
- APK SHA-256: `0d56469035be0e871ce8784f157bf3d732782ba39ba72cf2a334fc8937de6519`.
- APK signature verification: **passed**, APK Signature Scheme v2, minimum Android API 24.
- Packaged identity inspected: `in.suhagbhandar.app.preview`, version `0.1.1-preview`, target API 36, label `Suhag Bhandar Test`.
- Compiled `asset_statements` inspected with `aapt2`; JSON retains its quotes and points to `https://suhagbhandar.in`.
- Website association fingerprints generated from the **actual APK signing certificate**, not a placeholder; root candidate and preview copy match.
- `git diff --check`, JavaScript syntax and Python syntax checks passed.

## Still required

The website verification candidate has **not been deployed**. Until deployment and browser validation, the app may show browser chrome. The owner must approve that publication.

No Android emulator/device execution or live checkout, Google OAuth, UPI, printing, downloading or WhatsApp acceptance was performed. The acceptance checklist in README.md must be completed on a phone. No Play Store upload/review has occurred.

GitHub denied branch creation with HTTP 403 (resource not accessible by integration). No remote branch, pull request or website deployment was created. The complete source ZIP is the handoff for these changes.

## Launch regression fixed

- The original APK omitted `ManageDataLauncherActivity`. Browser Helper calls `PackageManager.setComponentEnabledSetting` for this component during every launcher startup on API 25+. The regression test demonstrated `NameNotFoundException` for the missing component in the original manifest. No crash log was collected from the user’s phone, so this is a confirmed source defect rather than a claim that all possible device causes are excluded.
- Registered the activity and its website metadata; retained the same browser-based architecture, app ID and signing certificate. Version code increased from 1 to 2, version name to 0.1.1-preview.
- All **six Robolectric runtime checks pass** on simulated Android 15/API 35 and Android 16/API 36: required component registration, launcher startup without a compatible browser, and splash rasterization. The component-registration test failed before the manifest fix and passes afterward.
- Android emulator boot could not be completed in this environment. No physical-device test is claimed.
