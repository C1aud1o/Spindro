# Games: design rules (apply to every game)

Written after two rounds of testing on a phone: the games had graphical defects, the gameplay did not hold attention and
the difficulty was not tuned. Better graphics are not enough. These rules are measured: a game is finished only if it
meets all of them, with the numbers in the summary. Most are checked for you by `npm run game:check -- <id>` (see §5).

(English translation of `docs/giochi-design.md`, the original Italian text, which now points here. This file is the
reference. The interface a game implements is in [API.md](API.md).)

## Names (the same in every language)
| id in code | name | in one line |
|---|---|---|
| `racer` | **Breakaway** | stage race: slipstream, climbs, sprint |
| `horde` | **Horde Run** | hold the road against the horde: more watts, more shots |
| `gruppetto` | **Slipstream** | pick up the riders and bring them into your slipstream |
| `planata` | **Updraft** | pedal-powered plane: your watts are your altitude |
| `mattoni` | **Feed Zone** | cycling-themed bouncing game: cadence is the speed |
| `shooter` | **Pedal Strike** | side-scrolling shooter: the flagship game |

New games add their own row here when they are accepted. `tempo` (and the `skeleton` 3D starter) are the templates in
`js/games/template/`, visible in developer mode only.

## 1. Every run is a workout with a shape
- The run has a length chosen at the start: **5, 10 or 20 minutes** (+ / − in the game's menu).
- The intensity follows a curve: an easy start of 45–60 s, then **waves of effort and recovery**, a harder finish, 30 s of
  cool-down with the summary. Never more than 90 s of effort above threshold without a recovery of at least 40 s.
- Everything is a **percentage of the rider's FTP** (`hooks.ftp()`): recovery 50–65 %, pace 75–90 %, effort 95–110 %,
  sprint 130 %+ for 5–15 s. With no trainer connected the demo simulates 0.8 × FTP with sprints. That way the game is fair to
  someone with 120 W of FTP and to someone with 320.
- **Three levels** (Easy −10 %, Normal, Hard +10 % on the percentages), chosen in the game's menu. **No adaptive
  difficulty**: the target in watts is only plan percentage × FTP (+ the chosen level), or exactly the workout's watts when
  a workout is running. Nothing changes the target automatically during a session.
- **Workout mode**: if the rider follows a workout, the workout is the run: the targets, the length and the stars come from
  it (`kit/workout-plan.js`): ★ finished, ★★ at least 60 % of the time within ±7 % of the target, ★★★ at least 85 %.

## 2. Something must always be happening
- **Within 8 seconds** of the start there is a first thing to do (an enemy, a rider, a target).
- Never more than **5 seconds** without an event that asks for something or rewards something.
- There is always **a visible goal** with a bar or a counter ("wave 3/8", "400 m to go", "5 riders out of 8").
- Every action gets an answer within 100 ms: a sound, particles, a number going up, a small camera shake.
- End of the run: **1 to 3 stars** with clear criteria, a personal best, something unlocked or a step towards the next one.

## 3. Bike controls
- You play **without touching the screen**: watts and cadence do most of it; + / − (Zwift Click) do one single thing per
  game, explained in one line in the menu. A long press of − is a pause (handled by the app).
- No punishment for pushing harder. No "game over" in the first minute. A rider who stops pedalling pauses the game and does not lose.

## 3b. The trainer is always in ERG
- In every game, with or without a workout, the trainer is in **ERG on the game's current target** for the whole run
  (`hooks.setTarget`, see API.md): never slope, resistance or gears mode, never a stopped target. A manual intensity (keys `[` / `]`)
  keeps working and is shown in the workout strip.
- **One workout strip** (`kit/workout-strip.js`), the same everywhere: kind and step, target watts and % FTP, time left, next step,
  the whole workout with the current position, elapsed / total. Without a workout it is fed by the game's own plan.

## 4. It must look good
- The playfield must be readable: the player's character is a **small figure, about 8–12 % of the screen height** (Horde Run, Feed Zone and
  the camera of every game: pulled back, never a close-up), enemies and targets at least 4–6 %, on 16:9 desktop (1280×720, 1920×1080)
  and on a portrait phone (390×844). Hitboxes do not follow the camera: balance stays as it is.
- **Matte, not neon**: no halos around characters or pickups, no blown-out whites, emissive only as a small accent. Bloom threshold high
  and strength low on every preset (`kit/quality.js`); lime `#D9FF3D` is used sparingly, like in the flat UI.
- No half-empty screen: the camera frames the action, not the asphalt.
- Text with the shared system (`js/games/kit/hud.js`): no overlaps, no text off screen, numbers readable from a metre away.
- **No defects in motion**: no object popping in near the camera, no model passing through another, no flicker of
  overlapping surfaces, animations without jumps, no "frozen" character or one that slides without moving its legs.

## 5. How to verify (mandatory, with the numbers in the summary)
1. **Bot** at four power levels: 0.6 × / 0.8 × / 1.0 × / 1.2 × FTP (FTP 200), 5-minute run at Normal level, seeded
   (`js/games/kit/rng.js`). For each: stars, time to the first event, longest interval without events, events per minute.
   Expected: 0.6 × finishes the run with 1 star; 0.8 × → 1–2; 1.0 × → 2–3; 1.2 × → 3.
   **`npm run game:check -- <id>` does exactly this** and prints the table; it exits with an error naming the rule that is
   broken (first event later than 8 s, a gap longer than 5 s, stars outside the expected range, a run that never reaches the
   results screen, a JavaScript error). The table goes in the pull request.
2. **Video**: record 20 s of full gameplay with Playwright's `recordVideo` (or frames at 10 per second) at 390×780,
   extract a strip of 12 consecutive frames and LOOK at it, searching for the defects in §4. Repeat after every fix. Save the
   final strips in `docs/giochi-shots/<game>-strip-*.png`.
3. **Performance**: average time per frame with the CPU slowed 4× at medium quality under 22 ms, or automatic quality that
   drops by itself. (`game:check` prints ms per frame with a 4× slowdown; on the software renderer of a CI machine this is
   only a hint: measure on a real GPU before you claim it.)
4. Existing tests green: `npm test`, `node tests/i18n-check.mjs`, `node tests/trainers/run.mjs`,
   `node tests/controllers/zwift-controllers.test.cjs`.

Note for testers: in a test script pass only `+1` or `-1` to `game.input()`. Any other value breaks the player's
position and the screen turns black: it is a mistake in the test, not in the game.

## Review checklist for a new game

This is what a reviewer ticks before merging a game (the same list is in the pull-request template).

- [ ] **Registry**: one entry in `js/games/registry.js`, the id follows the naming rule in [API.md](API.md); the card shows in the list.
- [ ] **Bot check**: `npm run game:check -- <id>` passes; the table is in the pull request (rules in §1, §2, §5).
- [ ] **+ / − only**: playable start to finish with + and − (and the pedals): menu, run, results. No touch needed.
- [ ] **ERG and strip**: `hooks.setTarget(w)` every frame of the run (the returned watts are shown and judged), the shared workout strip drawn and exposed as `stripInfo()`, no slope/gears mode, no target block of your own.
- [ ] **Workout mode**: with a workout under the game, the run follows it, ends with it, stars by the shared rule (§1).
- [ ] **No pressure**: pushing harder is never punished, stopping pedalling pauses, no game over in the first minute (§3).
- [ ] **Text through i18n**: every visible string is `t('games.<id>...')` and exists in all five `locales/*.json`; `node tests/i18n-check.mjs` passes.
- [ ] **Interface**: the rules in "What a game must never do" ([API.md](API.md)): no Bluetooth, no DOM outside the canvas, localStorage only under `<id>`, no network, `stop()` removes everything it added.
- [ ] **Assets**: every sound, model, font and image has a clear licence (CC0 / MIT / OFL, or generated for the project), is credited in `README.md` and `docs/legal/licenses.*.md`, and every file is in `ASSETS` in `sw.js`.
- [ ] **Originality**: the game does not recreate an existing commercial game (no copied characters, levels, names, art or sounds; a genre or a mechanic is fine, a clone is not).
- [ ] **Looks**: a 12-frame strip at 390×780 was looked at and §4 holds.
- [ ] **Tests**: `npm test`, `node tests/trainers/run.mjs`, `node tests/controllers/zwift-controllers.test.cjs` are green; the game has at least a menu → run → results test.
- [ ] **Hardware claims**: nothing says "verified" about a device unless it was tested on real hardware.
