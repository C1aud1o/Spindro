# QA q1 — the whole app except the 3D games and device connection

Branch `qa/q1-app`. Method: `scripts/qa/` (Playwright, fake devices from `tests/fake-ble.js`), screenshots in a temp folder (never in the repo),
contact sheets per screen, scripted audits, axe. Nothing here was verified on real hardware: only simulated trainers and a simulated Click.

How to re-run:

```sh
PORT=4180 node tests/serve.mjs &                         # static server (the scripts use :4180)
node scripts/qa/explore.mjs [--vp s360,s390] [--lang de] [--scene home,history] [--axe]   # matrix + audit (+ axe)
node scripts/qa/probe.mjs        # interaction probes (Esc, arrows behind sheets, focus)
node scripts/qa/probe2.mjs       # first run, blocked storage, full storage
node scripts/qa/monkey.mjs       # clicks every button of every screen, reports errors and dead buttons
node scripts/qa/cls.mjs          # layout shift / flash of untranslated content
node scripts/qa/beta-check.mjs   # CHANNEL=beta WEB_DEPLOY=1 build: CSP violations and the beta: storage prefix
```

Regression tests added: `tests/qa-q1.spec.mjs`, `tests/sw.spec.mjs`.

## Coverage checklist

Matrix: viewports 360×640, 390×780, 412×915, 768×1024, 1280×720 × languages it, en, de, fr, es (every combination was run for the
scenes below with the automatic audit; screenshots were reviewed as contact sheets for 360/390 in all five languages and for 768/1280 in en/de/fr).

- [x] Home: no trainer (welcome card), trainer connected, Click connected (legend bar), plan active, long names / FTP 450
- [x] Ride cockpit: ERG, virtual gears (Click legend), 4-digit watts, 9-hour ride time, restored session
- [x] Other modes (virtual gears, slope, resistance) panel
- [x] Workouts: library, custom workout with a very long name, editor, .zwo import (parser), GPX routes (parser, drawing)
- [x] Training plans: list, active plan, home card, DST-safe day arithmetic (code review: `plans.js` uses day numbers)
- [x] History and records, weekly bars (DST), records, share card (code review), FIT export (decoded and validated in a test), backup export/import/wipe
- [x] Settings: every control reached by the monkey run, scroll sweep of the whole sheet in all languages/viewports
- [x] Consent sheet, safety notice (first run, full storage, blocked storage)
- [x] Click menu / legend bar / controller key check (existing suites + visual review)
- [x] Video ride screen (code review only: YouTube needs the network), games list
- [x] Dialogs and toasts, Escape / back button, focus after closing a sheet
- [x] Service worker: offline start, update to a new version, stale or broken cache
- [x] Beta build path (`CHANNEL=beta WEB_DEPLOY=1`): zero CSP violations, `beta:` storage isolation
- [x] axe on every scene above: all five languages at 390 px, en/de at 768 and 1280 px; scripted tap-target (≥ 44 px) and overflow checks on the whole matrix
- [x] Console errors/warnings, CSP violations, unhandled rejections: none on any scene

## Defects found and fixed

Commit column: `c1` = first QA commit (sheets, DST, FIT, service worker, plurals, narrow layouts), `c2` = second (layout shift, storage, GPX, locale numbers),
`c3` = third (storage quota, a11y), `c4` = manifest colours and the calibration test. Hashes are in `git log` on the branch.

| # | Screen | Lang / viewport | What was wrong | Fix | Commit |
|---|--------|-----------------|----------------|-----|--------|
| 1 | Ride cockpit | all / 360–412 | A 4-digit wattage (≥ 1000 W) overflowed the card and made the page scroll sideways | `data-digits` on the power value; CSS zoom for 4 digits | c1 |
| 2 | History sheet | de / 360 | The sheet was wider than the screen (grid tracks sized by the longest German word, KPI grid) | `minmax(0,1fr)` tracks, 2×2 KPI grid on phones, wrapping `dt` | c1 |
| 3 | Home device bar and metrics | de, fr, es / 360 | Labels cut with "…" (Rollentrainer, Herzfrequenz, Fréquence cardiaque, Trittfrequenz, Geschwindigkeit, "Heart rate") | Shorter labels (Trainer, Puls, Kadenz, Tempo, Cardio, Rouleau, Pulso, HR); metric labels wrap; value row wraps to two lines on narrow columns | c1, c2 |
| 4 | Any sheet | desktop | **Esc did not close sheets**; arrow keys / PageUp/Down / +/- changed the ERG target or gear behind an open sheet | `closeTopLayer()` shared by Esc and the back button; steering keys ignored while a layer is open | c1 |
| 5 | Any sheet | all | Focus was not moved into the sheet, not returned to the opener, and Tab reached the page behind; closing a stacked sheet unlocked scrolling | `inert` on the page behind, focus into the sheet and back to the opener, lock follows the number of open sheets | c1 |
| 6 | History | all (any timezone with DST) | The weekly bars lost a week across a DST change (week start computed by subtracting `7*24h`) | `weekBuckets()` steps by calendar date | c1 |
| 7 | FIT export | all | After a pause/restore two samples in the same second produced duplicate `record` timestamps (Strava rejects such files); `Math.max(...samples)` fails on very long rides in Safari | one record per second, in order; reduce instead of spread | c1 |
| 8 | Service worker | all | A 404/500 passing through was cached over the good file, so offline the app stayed broken; offline start failed for any URL with a query string (`?code=`, `?utm=`) | cache only `200` same-origin responses, `ignoreSearch` + `index.html` fallback; cache bumped to v86 | c1 |
| 9 | Settings → Delete all data | all | The page's own `pagehide` wrote the session key back right after the wipe | `wiped` flag stops `persist()` | c1 |
| 10 | Ride | all | After reset or restore, the "10 minutes / 5 km" toasts and coach calls fired again for milestones already passed | milestones reset on reset and derived on restore | c1 |
| 11 | Home, finish, share | it, fr, es, de | "1 sorties sur 21", "1 minutes en selle" | plural forms (`finish.praise`, `share.title`, `plans.progress`) | c1 |
| 12 | .zwo import | all | `Repeat="99999999"` froze the app; names were unlimited | repeat capped at 100, name at 60 (editor too) | c1 |
| 13 | Home | all | Layout shift on load (CLS 0.5–0.67): the page painted before the translations and cards were ready | page revealed when the app is ready, CSS-only 2.5 s safety reveal | c2 |
| 14 | Startup | all | With localStorage blocked (blocked cookies) the app never started | `js/storage-guard.js`: memory fallback | c2 |
| 15 | Safety notice | all | With a full storage the notice could never be acknowledged (it re-opened on every Start) | acknowledged for the session as well | c2 |
| 16 | Finish → resume → finish | all | The first finish saved the ride in the history; after resuming, the extra minutes never reached the history, records or challenges | the history entry is updated in place (same timestamp, same sync id) | c2 |
| 17 | GPX routes | all | Empty `lat/lon` became (0,0) points, a non-numeric elevation produced NaN grade, a stationary track gave a broken route, tracks > ~120 000 points crashed drawing (`Math.min(...)`), names unlimited | parse with `parseFloat`, reject stationary tracks, loops instead of spreads, name capped at 60 | c2 |
| 18 | History, route, calibration, slope label | de, fr, es | Decimals ignored the language (`111.5 km`, `7.37`, `2.5 %`) | `fmtDec` | c2 |
| 19 | Developer-mode toasts | de, fr, es | English text | translated | c2 |
| 20 | Ride | fr, de / 360–390 | A 9-hour time (`9:00:00`) overflowed its cell and made the page scroll | smaller type from one hour on | c2 |
| 21 | Home, history, editor | 360–768 | Standalone link buttons (Delete, ↑ Up, Skip, "227 W verwenden") and slope chips were smaller than 44 px; the workout card meta broke onto three lines | 44 px hit areas, chips wrap on narrow columns, meta below the title | c2 |
| 22 | Settings | ≤ 400 px | Weight, FTP and HR fields were 33 px wide | one column on phones | c2 |
| 23 | Stepper buttons (− / +) | all but it | Screen-reader label hard-coded in Italian | `ui.increase` / `ui.decrease`, refreshed on language change | c3 |
| 24 | Any setting | all | With a full storage every settings change threw inside its handler | `setItem` swallows quota errors and warns once (`storage.full`); history keeps its own trimming via `strictSet` | c3 |
| 25 | Challenges card | all | Progress bars without an accessible name (axe `aria-progressbar-name`) | `aria-label` | c3 |
| 26 | Finish, settings | all | White text on the Garmin blue / Strava orange buttons: contrast below 4.5:1 | dark text on the brand fill | c3 |
| 28 | Web manifest | all | `theme_color` / `background_color` (#0f1115) differed from the page's `theme-color` (#0f0e0c) | aligned | c4 |
| 27 | Game panel | all | `#muteGame` accessible name ("Audio") did not contain its visible text ("Audio on") | name = visible text | c3 |

## Seen but not fixed

- **Device name in the home device bar** (e.g. "Van Rysel D100 (finto) · FTMS") is clamped to two lines with "…" on phones. Deliberate in the current design; the full name is in the Devices sheet.
- **Settings are not reachable while a ride exists** (the header is hidden in the cockpit, also after a reload that restores a paused ride): by design, but a restored ride hides Settings until the user finishes or resets it.
- **PWA icon** (`icons/icon.svg`) is orange on #0f1115 while the app's accent is lime: a branding mismatch that needs a new asset, not a code fix. The manifest also locks `orientation: portrait` although the app has tablet/desktop layouts.
- **Session persistence cost**: the whole 1 Hz log is serialised every 10 s (≈ 2–3 MB for a 9-hour ride). Works, but a full storage now only produces the one-time "storage full" toast and the ride is no longer restorable; a chunked store would be needed to fix it properly.
- **Backup import** copies every key of the file, including the consent choice (`analytics`) and `safetyAck`, from the other device. Left as is to avoid changing the backup format the night before launch.
- **3D vendor files** (`vendor/three/**`) are not in the service-worker precache (cached at first use, as documented), so a game never opened online will not start offline. Games area, not touched.
- **Games / device connection internals** (`js/games/**`, `js/devices*.js`) were not audited here, as agreed.
- Not verifiable here: real Bluetooth hardware, real Android WebView/back button, the YouTube player (needs the network), Safari/iOS, `localStorage` limits on real phones, GoatCounter loading after consent (no DSN in the repo config).
