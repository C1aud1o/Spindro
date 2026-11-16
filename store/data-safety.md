# Google Play: Data safety answers

Prepared 15 November 2026 from what the code does (`js/monitor.js`, `js/config.js`, `js/strava.js`, `js/videoride.js`,
`android/app/src/main/AndroidManifest.xml`) and from Google's help page "Provide information for Google Play's Data
safety section" (read on that date). The answers are only as good as this match: re-check them whenever a feature
that sends data is added, and see `docs/compliance-report.md` for the open questions marked **(decision)**.

Definitions used by Google: *collect* = data leaves the device through the app; *share* = transfer of collected data
to a third party, except to a service provider acting on the developer's instructions, or a transfer the user starts
and reasonably expects.

## Summary answers

| Question | Answer | Why |
|---|---|---|
| Does the app collect or share any of the required user data types? | **Yes** (see the table) | optional anonymous usage counts; optional Strava upload |
| Is all of the user data collected by the app encrypted in transit? | **Yes** | everything uses HTTPS |
| Do you provide a way for users to request that their data is deleted? | **No** for the anonymous counts (no identifier, so a request could not be matched to anyone); **Yes** for everything else: "Delete all my data" in Settings, uninstall | the app has no accounts and the developer holds no personal data |
| Data collected is processed ephemerally? | No | GoatCounter keeps aggregated counts |
| Account creation | **None** (no accounts, `FIREBASE_CONFIG = null`) | |
| Independent security review / "Families" / ads | No, no, **no ads, no advertising ID** | |

## Data types

| Category / type | Collected | Shared | Optional | Purpose | Notes |
|---|---|---|---|---|---|
| **App activity → App interactions** | Yes | No (GoatCounter acts as a service provider for the developer) | **Yes**: asked once on first run, off unless the user says yes, changeable in Settings | Analytics | Only these anonymous events: app opened, language, trainer protocol type (e.g. "FTMS"), game opened, ride completed. No identifier, no cookie. Nothing is sent before a yes (test: `tests/compliance.spec.mjs`). |
| **Health and fitness → Fitness info** and **Health info** (heart rate) | Yes, **only when the user taps "Upload to Strava"** | No: user-initiated transfer to Strava, with the user's own credentials | Yes | App functionality | The `.FIT` ride file (power, cadence, heart rate if a strap is used, route if loaded) goes from the device straight to Strava. The developer receives nothing. **(decision)** Google counts any off-device transfer as "collection" even if the developer never sees it; declaring it is the cautious reading. |
| Location | **No** | No | | | `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` are declared with `maxSdkVersion="30"` only because Android 11 and older require them for Bluetooth scanning; `BLUETOOTH_SCAN` carries `neverForLocation`. The app never reads or sends location. |
| Device or other IDs | **No** | | | | No advertising ID, no Android ID, no install ID. |
| App info and performance (crash logs, diagnostics) | **No** | | | | Sentry code exists but `SENTRY_DSN` is empty: nothing is sent. If it is ever switched on, update this table first. |
| Personal info, Financial info, Messages, Photos and videos, Audio, Files, Calendar, Contacts, Web browsing | **No** | | | | A video file chosen for a video ride is played locally and never uploaded. |

**Embedded YouTube player (video ride):** on the user's tap the app loads Google's YouTube player in the WebView; Google
processes the request under its own policies. **(decision)** whether to add "Device or other IDs / App activity,
collected, shared with Google, optional, App functionality" to be cautious; the app itself sends nothing to YouTube
except what the player does.

## Permissions declaration (as in the manifest)

| Permission | Declared reason |
|---|---|
| `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT` | find and connect to the user's trainer, power meter, heart-rate strap and Zwift controllers |
| `BLUETOOTH_ADVERTISE` | optional watch bridge: the phone appears as a standard Bluetooth cycling sensor so a watch can read speed, power and cadence |
| `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (all `maxSdkVersion="30"`) | required by Android 11 and older for Bluetooth scanning; location is not read |
| `INTERNET` | load the app's own files, optional anonymous counts, YouTube video rides, Strava upload |
| `VIBRATE` | haptic feedback |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | added to the merged manifest by `@capacitor/local-notifications`: the optional local training-plan reminder (asked only when the user switches it on; nothing is sent anywhere) |
| `<uses-feature bluetooth_le required>` | the app cannot work without Bluetooth Low Energy |

No background location, no foreground service, no SMS/contacts/camera/microphone, no `QUERY_ALL_PACKAGES` in the app manifest. Backup: `allowBackup` stays on but `data_extraction_rules.xml` / `backup_rules.xml` exclude every domain from cloud backup and keep only device-to-device transfer (no data answer changes: nothing is sent to the developer or to Google by the app). The BLE plugin's own location/`BLUETOOTH_SCAN`/`required` declarations are overridden in the app manifest (`tools:node="replace"`), so the merged manifest keeps `maxSdkVersion="30"`, `neverForLocation` and `required="true"`. **(decision/verify)** this table follows the app manifest plus the plugin manifests read in `node_modules`; the real list is the *merged* manifest of the release APK (Android Studio → Merged Manifest, or `aapt dump permissions`), which could not be built here. In particular `@capacitor-community/bluetooth-le` declares `ACCESS_FINE/COARSE_LOCATION` without `maxSdkVersion`: check the merged result still says `maxSdkVersion="30"`.

## Store listing and health claims

- The listing (`fastlane/metadata/android/*`) describes training features and compatibility only. It makes no medical, weight-loss or diagnostic claim. The app is **not a medical device**; the in-app safety notice and the Terms say so.
- Compatibility is stated as tested only for the Van Rysel D100 (and the + / − keys of one Zwift Click v2); everything else is "experimental / expected". Keep it that way.
- Third-party names appear only descriptively, with the independence disclaimer at the end of each description. No Zwift, Garmin, Strava or Decathlon logos are used in the icon, feature graphic or screenshots (checked in `store/` and `fastlane/`; screenshots show the app's own UI). **(decision)** a human should glance at the screenshots once more for any third-party logo or video thumbnail.
- Target audience: the Terms and Privacy Policy say "not for children under 14". **(decision)** pick "18+" or "13+/16+" in the Play Console target-audience form consistently with that; do not opt into "Designed for Families".
- Health apps declaration: complete the Play Console "Health apps" form if it is shown for this app. Not verified, could not read that policy page.
- Privacy policy URL to enter: https://spindro.fun/privacy/
