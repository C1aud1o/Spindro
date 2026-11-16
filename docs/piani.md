# Training plans: principles, sources, status

Code: `js/plans.js` (pure logic), `js/plans-ui.js` ("Plans" sheet, home card, reminders). Tests: `tests/plans.spec.mjs`.

## Free plans
| Plan | Length | Rides | Idea |
|---|---|---|---|
| First steps on the trainer | 3 weeks | 3 × 30–40 min | Habit before intensity. Ramp test on day 3 and at the end. |
| More FTP | 6 weeks | 3–4 | Sweet spot and threshold in progression, recovery week in week 4, peak in week 5, recovery + test in week 6. Ramp test at the start. |
| Winter base | 8 weeks | 3 | Long zone 2 (60→90 min) + one quality session a week (sweet spot/tempo). Recovery weeks 4 and 8. |
| Back in shape | 4 weeks | 3 | Gradual restart after a break: easy, then some endurance and one quality session; week 4 recovery and test. |

The workouts are those of the library (`sblocco`, `fondo`, `sweet`, `soglia`, `piramide`, `ramp`) plus six new ones in % FTP: `facile` (30'), `costante` (40'), `tempo` (2×12'), `lungo60/75/90`. No text or data was copied from other plans: only generic patterns.

## Principles used
- **Progression and gradual overload**: the load (duration or intensity) rises a little at a time, never both together.
- **A recovery week every 3–4 weeks** (less volume/intensity to absorb the work): More FTP (4 and 6), Winter base (4 and 8), Back in shape (4).
- **Polarized/80-20 distribution**: most rides are easy (zone 2), one or two quality rides a week, never two hard days in a row (days of the week: 0-2-4, 0-2-3-5, 0-2-5).
- **FTP test at the start and at the end** where it makes sense: the app's ramp test (FTP = 75% of the best minute, Bergeron/Zwift-style ramp test).
- **Zones in % FTP** (Coggan): Z2 56–75%, tempo 76–90%, sweet spot 88–94%, threshold 95–105%, VO2 106–120%.
- **Catching up**: a missed ride can be made up within 2 days; after that it is lost (no discouraging "debt").

General sources (principles, not texts): Coggan & Allen, *Training and Racing with a Power Meter*; Seiler, "What is best practice for training intensity and duration distribution in endurance athletes?" (2010); Laursen & Buchheit, *Science and Application of High-Intensity Interval Training*; Mujika & Padilla on tapering. The plans are not medical advice: anyone with health problems should ask a doctor.

## How it works
- State in `localStorage` key `plan`: `{ id, start (day), done, skipped, moved }`. No account.
- A ride is **done** if the right workout finishes on its day or in the 2 days after (also when moved: the new day counts). You can **skip** it, **move it to tomorrow**, or **abandon** the plan.
- At the end of a workout, if it was scheduled, it is ticked in the week view on the home screen with a message ("Plan ride done! 4 of 9…", "Week completed", "Plan completed"). The ramp test counts if it produces a result.

## Reminders
- **Android**: local notifications (`@capacitor/local-notifications` 7.0.7, no server). One per ride not yet done, at the chosen time (default 18:00), up to 60; they are rescheduled on every plan change and at start-up. The permission is requested when the plan is started or the reminder is turned on; it is turned off with the checkbox. No exact-alarm permission: the time can slip by a few minutes on a phone in battery-saving mode.
- **Web**: no push; the reminder is the home card.
- After `npm install`: `npm run android:sync` (already done: it edits `android/capacitor.settings.gradle` and `capacitor.build.gradle`). To be tried on a real phone (not verified here).

## TODO
- **Account sync**: not "simple". `plan` and `planRemind` would go in `PREF_KEYS` (`js/account/sync-core.js`) **and** in the closed list `prefKeys()` of `firebase/firestore.rules` (with a rules deploy, and updating `docs/account-architettura.md`). The per-key merge is already last-write-wins. A task of its own.
- A small notification icon (`ic_stat_*`); Android currently uses the default one.
- Move to any day (today only "to tomorrow", repeatable).
