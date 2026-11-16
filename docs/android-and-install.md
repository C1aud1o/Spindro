# Android app and installing Spindro

Spindro is one web app (`index.html`, `js/`, no bundler). It reaches users in three ways: the **Android APK**, the
**installable web app (PWA)** and a plain browser tab. Production lives at https://spindro.fun/app/, beta at
https://spindro.fun/beta/ (see [environments.md](environments.md)).

## How the Android shell works

- [Capacitor 7](https://capacitorjs.com) packs the web files (`www/`, copied by `scripts/copy-web.mjs`) into the APK and serves them to
  a WebView from `https://localhost`. The Capacitor bridge is injected by native code (`addDocumentStartJavaScript`; on very old
  WebViews as a `<script>` right after `<head>`, i.e. *before* the CSP meta tag, so the policy never blocks it).
- **Bluetooth**: the WebView has no Web Bluetooth. `js/native.js` installs a `navigator.bluetooth` equivalent on top of
  `@capacitor-community/bluetooth-le`; trainer, Zwift Click, heart-rate strap and power meter use the same code as the web app.
- **Garmin bridge** (`android/app/src/main/java/com/spindro/app/GarminBridgePlugin.java`): the phone advertises standard BLE
  *Cycling Power* and *Speed & Cadence* services so a watch can record the ride. It also saves/shares FIT files (`saveDownload`,
  `shareFile`) and opens links outside the WebView (`openUrl`, http/https only).
- **Back button** (`MainActivity` → `window.rfBack()` in `js/app.js`): closes the top sheet/game first; during a ride the second press
  within 2.5 s only sends the app to the background, it never exits; outside a ride it exits.
- **Screen**: `FLAG_KEEP_SCREEN_ON` is set on the window (the screen stays on while Spindro is in the foreground), and the page also
  holds a Screen Wake Lock during a ride or game and re-acquires it on `visibilitychange`.
- **Timer**: ride time is `Date.now() - start` (wall clock), so a throttled or suspended WebView cannot make it drift. Per-second
  samples are not recorded while JavaScript is suspended (there is no foreground service); the FIT file has a gap, not wrong times.
- **No foreground service on purpose**: keep Spindro in the foreground while riding. A foreground service would need a Play
  declaration (`connectedDevice`) and a persistent notification; decide that separately.
- **Content-Security-Policy**: `index.html` meta. Reviewed against Capacitor 7 source: bridge calls go through `androidBridge.postMessage`
  (not network), downloads/share/open-link go through native plugin calls, notifications are native, so none of them touch the CSP.
  `blob:`/`data:` in `connect-src`/`img-src` (three.js loaders), `'wasm-unsafe-eval'` + `worker-src blob:` (meshopt decoder),
  `style-src 'unsafe-inline'` (style attributes) and the YouTube script/frame hosts are required and present. `tests/csp.spec.mjs` proves them
  in a browser. If `FIREBASE_CONFIG` or `STRAVA_PROXY` are ever set, add their hosts (`js/config.js` says so).

## Build

```sh
npm ci
npm run build:web && npx cap sync android          # CHANNEL=beta for the beta variant, VERSION_CODE=n for the build number
cd android && ./gradlew assembleFossDebug          # needs the Android SDK (ANDROID_HOME) and JDK 21
# -> app/build/outputs/apk/foss/debug/app-foss-debug.apk
```

| | Stable (`main`) | Beta (`beta`) |
|---|---|---|
| `CHANNEL` | `prod` (default) | `beta` |
| Application id | `com.spindro.app` | `com.spindro.app.beta` |
| Label / versionName | "Spindro" / `1.0.<n>` | "Spindro Beta" / `1.0.<n>-beta` |
| Release | `app-android` | prerelease `app-android-beta` |

Flavors: `foss` (public APK, no Google services) and `play` (AAB for Google Play; Firebase hook point only). Both are identical today.
CI is `.github/workflows/android.yml`: signed release APK + AAB when the secrets exist, otherwise the debug APK.

**Signing**: GitHub Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow
decodes the keystore into the runner's temp dir, exports `ANDROID_KEYSTORE_FILE` & co. to Gradle and deletes it afterwards. Keystores never
go in the repository.

**Icons and splash**: `node scripts/make-icons.mjs` (Chromium via `PW_CHROMIUM_PATH`) redraws every PNG from `icons/icon.svg`: PWA icons,
maskable icons, apple-touch icon, Android launcher (adaptive foreground, monochrome layer for themed icons, legacy square and round) and splash.

**Target SDK**: `targetSdkVersion 35`. Google Play currently requires **API 36** for new apps and updates (deadline 31 Aug 2026, per Google's
Play Console help). The APK is unaffected; a Play upload needs a bump to `compileSdk`/`targetSdk` 36 (and an AGP/Capacitor combination that
supports it) and a full test round. *Not done here: no SDK to build with.*

## Permissions: what each is for

| Permission | Why | When asked |
|---|---|---|
| `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT` | find and connect to trainer, strap, power meter, controllers | at the first Bluetooth action (Android 12+) |
| `BLUETOOTH_ADVERTISE` | Garmin bridge (the phone acts as a sensor) | only when the bridge is switched on |
| `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE/COARSE_LOCATION` (`maxSdkVersion=30`) | Android 11 and older need them to scan; location is never read | at the first scan on Android ≤ 11 |
| `INTERNET` | app files, optional anonymous counts, YouTube rides, Strava | – |
| `VIBRATE` | haptics | – |
| `POST_NOTIFICATIONS` (+ `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` from the local-notifications plugin) | training-plan reminders | only when the user turns reminders on (`js/plans-ui.js`) |

The app manifest overrides the Bluetooth plugin's broader declarations (`tools:node="replace"`), so the merged manifest keeps
`maxSdkVersion="30"`, `neverForLocation` and `required="true"`. Nothing is exported except the launcher activity (it also receives
"Share" of plain text, used for YouTube links). Cleartext traffic is off; WebView debugging is on only in debuggable builds (Capacitor default).

**Backup**: `allowBackup="true"` with explicit rules: nothing goes to the Google cloud backup (ride history is personal data); device-to-device
transfer keeps everything (Android 12+; Android ≤ 11 has no transfer). Files: `res/xml/data_extraction_rules.xml`, `backup_rules.xml`.
Documented in `docs/legal/privacy.*.md`.

## Installing

**Android APK**: open https://spindro.fun/app/spindro.apk (stable) or https://spindro.fun/beta/spindro-beta.apk (beta) on the phone, download,
allow "install from this source". Each new build installs over the previous one (same signing key). Beta installs next to stable.

**Web app (PWA)**: Chrome/Edge on Android or desktop: open /app/ and use the install button in the address bar or menu ("Install app").
Beta: /beta/ installs as a separate app named "Spindro Beta" (own manifest `id` `/beta/`, own cache prefix `beta-spindro-`, own storage keys).
Web Bluetooth only works in Chromium (Android, desktop), not in Firefox or any iOS browser. When a new version is downloaded, a small
"A new version is ready · Reload" bar appears (never during a ride); otherwise it applies on the next launch.

**iOS**: Safari → Share → "Add to Home Screen" gives the icon and a standalone window, but iOS has no Web Bluetooth, so trainers cannot connect.
iOS users can use the app only to browse and plan.

## Tests

`tests/pwa.spec.mjs` (manifest, icons, maskable safe zone, beta transform, offline start, update prompt), `tests/csp.spec.mjs`.
Phone-only checks: [qa/phone-checklist.md](qa/phone-checklist.md).
