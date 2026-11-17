# Compliance audit report

Audit of 15 November 2026, branch `legal/l1-compliance`, the day before the public launch. Written by an automated
assistant for the maintainer. **It is not legal advice**: where a legal conclusion would be needed, the item is marked
*needs a human decision* with the exact question. Third-party pages I could not read are marked "not verified, could not
fetch".

## Running checklist

- [x] 1. Open-source licences: inventory, `docs/legal/licenses.*.md`, `THIRD-PARTY-NOTICES.md`, README credits, Settings → "Open-source licences" link, LICENSE checked
- [x] 2. Fonts self-hosted, Google Fonts removed from app and site, network-request inventory, privacy pages exact, CSP in app and site
- [x] 3. Privacy pages vs code, consent tests (no answer / "No" → zero requests), false "errors are sent" sentence removed from the consent sheet
- [x] 4. Terms, health notice, safety notice before the first ride (5 languages) with test
- [x] 5. Brands and third-party terms: wording, compatibility claims, Strava "View on Strava", YouTube player not covered, `store/data-safety.md`
- [x] 6. Accessibility: axe-core tests on app screens and site pages, labels fixed; reduced motion, focus, contrast
- [x] 7. Repository hygiene: secrets/paths scan, SECURITY, CODE_OF_CONDUCT, CONTRIBUTING
- [ ] Remaining: only the human decisions listed at the end (nothing left to do in code)

Tests added: `tests/compliance.spec.mjs` (consent, no-request rule, Google Fonts, CSP, safety notice, licences entry,
translations, `ASSETS`, site pages), `tests/a11y.spec.mjs` (axe-core, new dev dependency). Dev-only changes to older tests:
`storageState` in `playwright.config.mjs` pre-acknowledges the safety notice; the two optional-account specs use
`bypassCSP` (the account feature is off and needs a different CSP).

## 1. Open-source licences

| Item | Evidence | Status |
|---|---|---|
| `LICENSE` is the full GPL-3.0 text | byte-compared with https://www.gnu.org/licenses/gpl-3.0.txt (fetched), no differences | OK |
| Source files claim no other licence | grep for MIT/Apache/BSD/SPDX in `js/`, `css/`, `index.html`, `sw.js`: only `vendor/` carries third-party headers | OK |
| `package.json` had no licence field | added `"license": "GPL-3.0-only"` (README says "GPL-3.0", no "or later") | fixed |
| three.js r170 (MIT) and add-ons | `vendor/three/LICENSE`, header of `three.module.min.js` | OK (notice text added) |
| meshoptimizer decoder 0.18 (MIT) | header of `vendor/three/addons/libs/meshopt_decoder.module.js` | OK |
| Capacitor core/android 7.6.10, local-notifications 7.0.7, bluetooth-le 7.3.2 (MIT) | `node_modules/*/LICENSE`, `vendor/capacitor/LICENSE` | OK (texts in `THIRD-PARTY-NOTICES.md`) |
| AndroidX appcompat, coordinatorlayout, core-splashscreen (Apache 2.0) | `android/app/build.gradle` | OK (full Apache text added; indirect Gradle dependencies not enumerated, no build possible here) |
| axe-core (MPL-2.0), Playwright (Apache 2.0), @capacitor/cli (MIT) | `package.json` devDependencies, not shipped | OK, listed |
| Fonts Barlow / Barlow Condensed (OFL 1.1) | `assets/fonts/OFL-Barlow.txt`, `site/assets/fonts/LICENSE-OFL.txt`; woff2 from the Fontsource packages | fixed (app now ships them) |
| Fonts Lilita One, Nunito (OFL 1.1) | `assets/fonts/OFL-*.txt` | OK. Lilita One has a Reserved Font Name ("Lilita"); files are used through the alias "Spindro Display" |
| Kenney packs (Blaster 2.1, Blocky Characters 2.0, Graveyard 5.0, Nature 2.1, Platformer 4.1, Racing 1.2, Music Jingles, Particle Pack): CC0 | each folder's `License.txt` read | OK |
| Quaternius packs (CC0) | `assets/3d/quaternius/License.txt` (download date and pack URLs recorded) | OK |
| Meshy-generated models (`assets/3d/meshy/`, 50 files) and icons (`assets/icons/`) | `scripts/meshy/README.md`, `js/games/kit/autorig.js`, README (old text said free-plan models are CC BY 4.0, newer ones need no attribution) | **needs a human decision** (see D1). Credit to Meshy now given for all, in README, licences pages, notices |
| Meshy terms of service | https://www.meshy.ai/terms and https://docs.meshy.ai/en/faq: HTTP 404 | not verified, could not fetch |
| Code sources named in comments: `js/click.js` (zwiftplay, SwiftControl, qdomyos-zwift), `js/trainers/fec.js` (Tacx how-to, GoldenCheetah), `js/trainers/wahoo.js` (GoldenCheetah, SwiftySensors, incyclist), `js/fit.js` | licences read on GitHub (raw LICENSE / repo page): **SwiftControl: Non-Commercial Software License Agreement v1.0 (OpenBikeControl UG, 2026); versions before its "gpl3" tag are GPL-3.0**; qdomyos-zwift: GPL-3.0; ajchellew/zwiftplay: no licence visible on its page; abellono/tacx-ios-bluetooth-example: GPL-3.0 label but README says GPL 2.0; GoldenCheetah: GPL-3.0 (known, not re-fetched); SwiftySensors, incyclist: **not checked** | **needs a human decision** (D2). The comments say the protocols were "consulted from memory"; Spindro's JS is not a copy, but protocol facts and possibly structure came from these sources |
| Attribution of the above | `THIRD-PARTY-NOTICES.md` section 6, `docs/legal/licenses.*.md`, README | fixed |
| Settings entry "Open-source licences" | `index.html` `#openLicences` in a new "Legal and licences" group, opens `/licenses/` (or `/it/licenses/`); test in `compliance.spec.mjs` | fixed |
| `THIRD-PARTY-NOTICES.md` with MIT / Apache / OFL texts | new file at the root | fixed |
| Licence not established, no guess | `icons/icon.svg`, `android/app/src/main/res/**` launcher icons, `site/assets/og.png`, `site/assets/favicon.svg`, `store/**` graphics, `site/assets/shots/**` (screenshots containing CC0/Meshy art): described as "original works of the project", but the repository has no record of how they were made | **needs a human decision** (D3) |

## 2. Fonts and third-party requests

| Item | Evidence | Status |
|---|---|---|
| Barlow loaded from Google Fonts | `index.html` had `<link>` to `fonts.googleapis.com` / `fonts.gstatic.com` | fixed: 8 woff2 (Barlow 400/500/600, Barlow Condensed 500/600/700 and italic 700/800: exactly the weights the old URL requested, Latin subset) in `assets/fonts/`, `@font-face` at the top of `css/style.css`, files added to `sw.js` `ASSETS`, cache `v82` → `v83`. Latin-ext subset is not shipped; all five languages use only Latin characters |
| Site fonts | `site/assets/fonts/`, no Google URL in `site/dist` (test) | OK |
| Request test | `compliance.spec.mjs`: a cold load makes zero requests to any non-local host, and none to Google Fonts | fixed (test) |
| Privacy pages updated | Google Fonts statement removed (both languages) | fixed |
| Content-Security-Policy, app | `<meta http-equiv>` in `index.html`: `default-src 'none'`; script `'self'` + hash of the import map + `'wasm-unsafe-eval'` (meshopt WebAssembly) + `gc.zgo.at`, `www.youtube.com`, `s.ytimg.com`; connect `'self'` + GoatCounter + `www.strava.com`; frame YouTube; img `'self' data: blob:` + GoatCounter; media `'self' blob: data:`; style `'self' 'unsafe-inline'` (inline `style=""` attributes are widespread); no `unsafe-eval`, no inline script allowed. Tested: whole games/start/settings flow without violations (`securitypolicyviolation` listener), allowed hosts load, others are blocked. `frame-ancestors` cannot be set by a meta tag | fixed. **Not tested on a device:** Android WebView/Capacitor (D6) and a real YouTube player |
| CSP, site | `site/build.mjs` `withCsp()` adds a per-page policy (hash of the one inline script; GoatCounter only) | fixed, tested on all pages |
| Beta build | `scripts/copy-web.mjs` injects an inline shim: it now adds the shim's hash to the CSP | fixed; check the first beta deploy (D6) |
| Sentry / Firebase hosts are not in the CSP | both are off (`SENTRY_DSN = ''`, `FIREBASE_CONFIG = null`); comment in `js/config.js` says to extend the policy before enabling | OK, documented |

Requests the app makes (compared line by line with the privacy page):

| When | Request | Privacy page |
|---|---|---|
| Load | own origin only: `index.html`, `css`, `js/*`, `locales/*.json`, fonts, `vendor/`, 3D/audio assets, `sw.js` (hosted on GitHub Pages) | stated |
| After "yes" to statistics, each launch | `gc.zgo.at/count.js`, then events to the GoatCounter endpoint (`app-open`, `lang`, `trainer/<protocol>`, `game/<kind>`, `ride-complete`) | stated, event list now exact |
| No answer or "No" | nothing | stated; **tested** (zero requests, no `<script>` element) |
| Video ride (YouTube link) | `www.youtube.com/iframe_api`, YouTube player iframe and what it loads | stated + YouTube terms links |
| Video ride (local file) | nothing (blob URL) | stated |
| Strava connect/upload/disconnect | `www.strava.com` `/oauth/token`, `/oauth/deauthorize`, `/api/v3/uploads`, status poll; authorization page and "View on Strava" link in the browser | stated (now also says disconnect revokes the token) |
| Taps on links | GitHub issue form, Garmin Connect import page, YouTube search, watch-maker support pages (`js/watchguide.js`), Strava activity | stated ("open in your browser only when you tap them") |
| Never | Sentry (`SENTRY_DSN` empty), Firebase (`FIREBASE_CONFIG` null), Strava bridge (`STRAVA_PROXY` empty), Google Fonts | the page says no error reports are sent |

Website requests: own files, plus `gc.zgo.at/count.js` and the GoatCounter endpoint on every page load (cookieless, no consent: stated).

## 3. Privacy pages vs code

| Item | Evidence | Status |
|---|---|---|
| localStorage keys (settings, FTP, HR max, mass, history, workouts, plans, game records, trainer names, Zwift key map, `stravaState`, `analytics`, `safetyAck`, `videoLast`) | grep of `localStorage` in `js/`; no IndexedDB, no cookies; service-worker cache for offline | page now lists them, incl. **Strava Client ID/Secret and tokens stored locally** (it did not before) |
| What `js/monitor.js` sends and when | GoatCounter only, only with `analytics === '1'`; `track()` returns early otherwise; `setConsent(false)` clears the queue | OK |
| Sentry | `SENTRY_DSN` empty → `loadSentry` returns. **The consent sheet said "App errors are sent anonymously… even if you answer No"**: false while Sentry is off | fixed: sentence hidden unless `SENTRY_DSN`; privacy page says no error reports are sent |
| Consent sheet text | listed only "games, trainer type, language" | fixed (5 languages): app opened, language, protocol, game, ride completed; "if you don't answer, nothing is sent" |
| Consent: as easy to refuse as accept, remembered, changeable | both buttons share the same class and size (tested); stored in `localStorage.analytics`; Settings → Privacy switch | OK |
| Nothing sent before a yes | `compliance.spec.mjs` (no answer, "No", after riding, after reload) and `monitoring.spec.mjs` | OK (tested) |
| Android permissions | merged list in the privacy page with a reason each (Bluetooth, advertise for the Garmin watch bridge, location ≤ Android 11 only, INTERNET, VIBRATE, plus notifications/boot/wake-lock added by `@capacitor/local-notifications`, which the page did not mention) | fixed; **merged manifest not built here** (D5) |
| `allowBackup="true"` | `AndroidManifest.xml`; page already disclosed it | OK as stated, but see D4 (Strava secrets are in app storage and so in the backup) |
| GoatCounter claims ("no cookies", "IP not stored") | taken from the previous text; GoatCounter's own documentation/terms not fetched in this audit | not verified, could not fetch (D7) |
| Hosting | the site says "GitHub Pages" | OK; GitHub's terms not checked |
| Controller identity / contact | pages name "the Spindro project" and GitHub issues | **needs a human decision** (D8) |

## 4. Terms pages and the safety notice

| Item | Evidence | Status |
|---|---|---|
| GPL warranty disclaimer consistent with the licence | `terms.*.md` §3 now cites GPL-3.0 §§15–16 | fixed |
| Health and safety | §4 had: not medical advice, doctor, stop if unwell, set up bike/trainer, ERG can be sudden; added: figures are indicative, not medical measurements | fixed |
| No promise the app cannot keep | §3: no promise of availability, error-free, device compatibility; "verified" only after real-hardware tests | fixed |
| Third parties | §6 no longer says fonts come from Google; adds YouTube ToS / Google Privacy links and Strava terms / API Agreement ("personal mode": you own your Strava API app) | fixed |
| Minimum age | 14 in terms and privacy (consistent) | OK; Play form (D9) |
| Governing law | §10 "Italian law; consumer protections of your country still apply" | **needs a human decision** (D8) |
| Safety notice once before the first ride | `#safetySheet`: one sentence, one button, shown on the first start of any ride (workout, game, route and plain ride all click `#startStop`); stored as `safetyAck`; keys `safety.*` in the five locales; `compliance.spec.mjs` | fixed (tested) |

## 5. Brands and third-party terms

| Item | Evidence | Status |
|---|---|---|
| Logos | no brand names in the SVGs or file names of `icons/`, `assets/icons/`, site assets and Android res (grep); raster images (PNG/WebP) not inspected pixel by pixel; `store/` and `fastlane/` images not inspected pixel by pixel | OK; screenshots need a human look (D9) |
| Disclaimer in site footer, README, trademark pages | footer `footer.trademark` (now also Google Play, Android, Bluetooth), README License section, `trademarks.*.md` (now with a "how each name is used" section) | fixed |
| Compatibility claims | `site/data/compatibility.json`: only the Van Rysel D100 is "verified". Fixed: Zwift Click note now says only the + / − keys of one v2 were tested; label "Should work, not yet verified"; removed "Garmin in daily use" (home page, both languages) and README "built and used with a Garmin watch" (no evidence in the repo); README Click row | fixed |
| Strava brand guidelines | https://developers.strava.com/guidelines/ read. Rules: official Connect-with-Strava button for OAuth, "Powered by/Compatible with Strava" only with the official logo files, no look-alike, "View on Strava" link text. Changes: label "Compatible with Strava" (uppercase, Strava orange) → plain "Works with Strava. Not affiliated…" in grey; public-mode button text "Connect with Strava" → "Connect your Strava account" (the official button wording is reserved); activity links read "View on Strava" in all languages | fixed. Remaining: orange `.strava-btn` colour (D10) |
| Strava API Agreement, personal mode | https://www.strava.com/legal/api read: "single API Token for a single Developer Application"; tokens must not be shared; user data may be shown only to that user; compliance with privacy law. Personal mode has each user create their own app and keep their secret on their device, which stays within those clauses as read; the agreement does not mention single-user personal apps | **needs a human decision** (D10); UI states the steps and that credentials stay on the device |
| YouTube: player visible and not covered | `js/videoride.js` drew a stats panel (canvas) over the lower part of the player. Fixed: for YouTube the player sits between the top bar and a 112 px data band (`.video-box.yt`), `min-height: 200px`; no HUD pixel over the player | fixed. Policy page https://developers.google.com/youtube/terms/required-minimum-functionality read (200×200 minimum, no overlays, no unsupported player changes) |
| YouTube: audio/video not separated, no background play | player is muted (`mute()`, audio is off, not extracted), controlled only through IFrame API (`playVideo/pauseVideo/setPlaybackRate`); new `visibilitychange` handler pauses when the page is hidden; no audio-only mode anywhere (grep) | fixed |
| YouTube: terms links | ToS and Google Privacy links in the video screen (5 languages), terms and privacy pages | fixed |
| YouTube: other policies | API Services Terms of Service and Developer Policies pages themselves not read | not verified, could not fetch (only one policy page was read) |
| Garmin | no Garmin SDK or logo (`grep`, `package.json`, `build.gradle`); the bridge advertises standard Bluetooth cycling services; `.FIT` written by `js/fit.js`; `#garminUp` is a plain neutral button | OK; brand-coloured buttons removed (D10); Garmin FIT SDK/licence terms not checked (D2) |
| Google Play | `store/data-safety.md` written (summary answers, data types, permissions declaration, listing/health-claim checks); Google's help page "Provide information for Google Play's Data safety section" read; other Play policy pages not read | fixed, with open points D5, D9 |
| Zwift controllers | `docs/zwift-controller.md` has a plain "Legal position" section; licences page and trademark page say: open-source reverse engineering for interoperability, no Zwift code/key/asset, no connection to Zwift's service; key exchange not implemented | fixed. Whether anything is copied: D2 |
| Store texts | `fastlane/metadata/android/*`: descriptive use only, disclaimer present, no medical claim, compatibility honest ("experimental", "tested mainly with the D100") | OK |

## 6. Accessibility and consumer basics

| Item | Evidence | Status |
|---|---|---|
| axe-core (WCAG 2.0/2.1 A and AA) | `tests/a11y.spec.mjs`: app home, settings, workouts, devices, ride, consent, safety (en and it) and site pages `/`, `/it/`, compatibility, privacy, terms, licences, trademarks (en and it). axe was not previously used in the repo (no dependency), so it was added | fixed: all pass |
| Violations found and fixed | `label-content-name-mismatch` on `#deviceBar` and `#rideMode` (aria-label did not contain the visible text: now `title`), on the site language links (`EN – English`), `scrollable-region-focusable` on site tables (`tabindex="0"`) | fixed |
| `lang` | `<html lang="en">` in the app (the language is set at run time: test asserts it for en and it); site `htmlLang` per page (test) | OK |
| Contrast | lime `#d9ff3d` on `#0f0e0c` computed ≥ 4.5:1 (test); axe colour-contrast clean on all screens above | OK |
| Focus visibility | global `:focus-visible` outline in `css/style.css` (test checks it is not `none`) | OK |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables animations/transitions globally (test) | OK |
| Games (canvas/WebGL) | not covered by axe; keyboard/Click navigation exists but is outside this audit | not checked |
| Site links | every page footer links privacy, terms, licences, trademarks, source code and issues (contact route); tested on all pages | OK |

## 7. Repository hygiene

| Item | Evidence | Status |
|---|---|---|
| Secrets | pattern scan of tracked files (GitHub/AWS/Google/Slack tokens, private keys): none; `.gitignore` excludes `*.jks`, `*.b64` | OK |
| Emails, phones | only third-party copyright lines (OFL, meshopt, npm `izs.me`), the maintainer's `noreply` commit address and an example; no phone numbers | OK |
| Local paths / session links | `/root/.ccr/ca-bundle.crt` in `scripts/meshy/generate.mjs` and `/tmp/claude-0/frames` in `scripts/racer-strip.mjs` | fixed |
| Personal names | none in tracked files (the commit author identity is intentional) | OK |
| `SECURITY.md` | existed, but pointed to a `[CONTACT EMAIL]` placeholder: now GitHub private vulnerability reporting only | fixed; the feature must be enabled in the repo settings (D11) |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 text already there; `[CONTACT EMAIL]` placeholder replaced with a GitHub-based route | fixed (D11) |
| `CONTRIBUTING.md` | DCO sign-off section existed; added an explicit sentence that contributions are GPL-3.0 | fixed |
| Dev scripts | 18 files in `scripts/` pre-set `safetyAck` so screenshot/bot runs are not blocked by the new notice | fixed |

## Decisions for a human

- **D1 Meshy.** (a) Which of the 50 models in `assets/3d/meshy/` and which icons were generated on the free plan (CC BY 4.0, attribution required) and which on a paid plan? The README said both existed; nothing records which, so all are credited to Meshy. (b) Is that credit wording enough for CC BY 4.0, and are you comfortable shipping CC BY assets inside a GPL-3.0 app as separately licensed assets? (c) Please read Meshy's current terms (they returned 404 for me).
- **D2 Protocol sources.** Confirm that no code (only protocol facts) was copied from SwiftControl (its current licence is non-commercial, incompatible with GPL-3.0), ajchellew/zwiftplay (no licence found), SwiftySensors and incyclist (licences not checked), and that `js/fit.js` uses only Garmin's public FIT file-format documentation under its terms. If anything was copied, remove it or get permission.
- **D3 Own artwork.** Confirm that `icons/icon.svg`, the Android launcher icons, `site/assets/og.png`, `favicon.svg` and `store/` graphics are your own work (or generated with a tool whose terms allow it), and add a line to the licences page.
- **D4 `allowBackup`.** The app stores the user's Strava Client Secret and tokens in `localStorage`, which Android's automatic backup copies to Google Drive. Do you want `android:allowBackup="false"` (or backup rules excluding the WebView storage)? The privacy page currently discloses the backup.
- **D5 Android manifest.** I could not build the APK. Please inspect the merged manifest of a release build: does `@capacitor-community/bluetooth-le`'s unconditional `ACCESS_FINE/COARSE_LOCATION` override the app's `maxSdkVersion="30"`? Are `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` really merged in (privacy page and Data safety now assume so)? Answer the Play Data safety form from `store/data-safety.md`, deciding whether Strava upload (user-started) and the embedded YouTube player are declared as collection.
- **D6 Device tests.** The CSP was tested in Chromium only. Please test on a real Android device (Capacitor WebView: Bluetooth, GoatCounter yes, YouTube ride, Strava) and on the first beta deploy, and watch for blocked requests. If a Capacitor bridge script is blocked, the fix is to add its hash/host to the policy in `index.html`.
- **D7 GoatCounter.** (a) `c1laud1o.goatcounter.com` (in `js/config.js` and `site/config.json`) looks like a typo of your handle `c1aud1o`: is that the real site code? (b) I did not fetch GoatCounter's terms or privacy documentation: please confirm that the "no cookies, IP not stored" statements and free use for this project match its current terms.
- **D8 Who is responsible.** The privacy page, terms and trademark pages name only "the Spindro project, maintained by volunteers" and a GitHub issues page. Do you want to name yourself (or an e-mail) as the data controller / contact in Italy? Is "governed by Italian law" (Terms §10) what you want to claim, or should it be removed/reworded after advice?
- **D9 Play listing.** Choose the target-audience age in the Play Console consistently with "not for children under 14"; complete the Health apps declaration if Play asks; glance at `store/` and `fastlane/` screenshots for any third-party logo or video thumbnail.
- **D10 Strava and Garmin look.** (a) Is "personal mode" (each user registers their own Strava API application) acceptable to Strava? Consider writing to Strava developer support. (b) Resolved in QA q1 round 3: the Strava and Garmin buttons now use the app's own neutral outlined style (words only, no logos or brand colours). If you ever enable the shared Strava bridge (`STRAVA_PROXY`), Strava requires its official "Connect with Strava" button artwork. (c) Strava's rate limits and API Agreement were summarised from one page read; read them fully before launch.
- **D11 GitHub settings.** Enable private vulnerability reporting for the repository (Settings → Security), otherwise the route in `SECURITY.md` and `CODE_OF_CONDUCT.md` does not work.
- **D12 Smaller points.** `docs/legal/account-deletion.*` still describes accounts that do not exist yet (harmless, but it is in the site footer); `TERMS_VERSION` / `PRIVACY_VERSION` in `js/config.js` were not bumped (only relevant when accounts exist); the YouTube player on very short landscape phones may fall under 200 px high only if the window is under ~376 px high (`min-height: 200px` is set, but check on a device); the store text promises "accounts and leaderboards planned for later", consider removing it.

## Update, 17 November 2026: licence changed to AGPL-3.0

The maintainer, sole author of every commit so far, changed Spindro's licence from GPL-3.0 to **AGPL-3.0-only** for all
versions from this date (`LICENSE` replaced with the text from https://www.gnu.org/licenses/agpl-3.0.txt; `package.json`,
README, legal pages, store texts, site and in-app labels updated). Versions published earlier remain available under the
GPL-3.0. AGPL-3.0 section 13 allows combining with GPL-3.0 code; the MIT, Apache, OFL, CC0 and CC BY components listed above
are compatible. `CONTRIBUTING.md` now adds to the DCO sign-off a licence grant to the maintainer that allows relicensing,
and `docs/legal/trademarks.*.md` states that the Spindro name and logo are not covered by the code licence. Not legal advice.
