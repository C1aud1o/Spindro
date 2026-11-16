<!-- RUNNING CHECKLIST (remove when finished)
done:  registry + list from it · app opens games via registry · template "Tempo" + 3D skeleton · types.js · demo rider · npm run dev · game:check · registry tests · state "results" unified · API.md
left:  CREATE-A-GAME · DESIGN-RULES · PR/issue templates · README/CONTRIBUTING sections · verify with scratch game · full test run · merge origin/beta
-->
# Game API

This is the contract between the Spindro app and a game. It is written from the code of the six shipped games and
of the template; where they used to disagree, the games were adapted to what is written here. Types for your editor
(autocomplete, no TypeScript needed) are in [`js/games/kit/types.js`](../../js/games/kit/types.js).

- Add a game in 15 minutes: [CREATE-A-GAME.md](CREATE-A-GAME.md)
- What a game must feel like, and what the bot check measures: [DESIGN-RULES.md](DESIGN-RULES.md)
- A complete example of about 150 lines: [`js/games/template/tempo.js`](../../js/games/template/tempo.js); the same for three.js, without gameplay: [`skeleton3d.js`](../../js/games/template/skeleton3d.js)

## The registry

Every game is one entry in [`js/games/registry.js`](../../js/games/registry.js). The games list, opening a game and the
direct URL `?game=<id>` all read it.

```js
defineGame({ id: 'mygame', icon: 'G1', load: () => import('./mygame/index.js').then((m) => m.MyGame) })
```

| field | type | meaning |
|---|---|---|
| `id` | `string` | lowercase letters and digits, unique; never changes once released (scores and personal bests are keyed by it) |
| `icon` | `string` | 2–3 characters on the card |
| `load` | `() => Promise<class>` | dynamic import of the class below; the code is downloaded only when the rider opens the game |
| `dev` | `boolean` | shown only in developer mode (seven taps on the version number in Settings): use it while a game is not ready |
| `noAudio` | `boolean` | the game does not use the shared audio: its constructor gets no third argument |
| `cls` | `string` | extra CSS class on the card |

### Naming rule (one rule for files, strings, storage and the service worker)

For a game with id `<id>`:

| what | rule |
|---|---|
| code | `js/games/<id>.js` or `js/games/<id>/index.js`; more files next to it |
| strings | `games.<id>.name` (title), `games.<id>.desc` (pitch for the card, 1–2 sentences), `games.<id>.help` (controls, **one line**), and any other key as `games.<id>.*`; all in the five `locales/*.json` |
| storage | localStorage keys start with `<id>` (`<id>Dur`, `<id>Best:5:normal`...); use `hooks.progress.bestOf / saveBest` for personal bests |
| service worker | while the game is `dev: true` nothing is needed (the service worker caches files at first use). Before it ships (no `dev`), every file it imports goes into `ASSETS` in `sw.js` so it works offline from the first visit, and the cache name is bumped once per release; `tests/games-registry.spec.mjs` walks the imports and names the missing ones |

The six shipped games keep their historical file and key names (`racer` → `racer3d.js`, `shooter` → `strike3d.js`,
`gruppetto` keys start with `slip`...). Nothing else is special about them.

## The class

```js
export class MyGame {
  constructor(canvas, hooks, audio) {}   // built once, on first open; do nothing heavy here
  active = false;                        // true between start() and stop()
  state = 'loading';                     // see "States"
  async start() {}                       // the rider opened the game
  stop() {}                              // the rider left
  input(dir) {}                          // + / − pressed: dir is exactly +1 or −1
  hold(dir) {}                           // optional: + / − held (±1) or released (0)
  end() {}                               // optional: finish the run now (tests, bot harness)
  eventStats() {}                        // optional but expected: { first, maxGap, perMin, n } (see "Events")
}
```

| member | called by | what you do |
|---|---|---|
| `constructor(canvas, hooks, audio)` | app, once | keep the three arguments; build the shared `GameMenu` and `ResultsView` (they only need descriptions). `canvas` is the 2D HUD canvas that fills the screen; a 3D game creates its WebGL canvas under it with `new Stage(canvas)` |
| `start()` | app, each time the game is opened from the list (may be `async`) | set `active = true`, size the canvas, attach listeners, start your `requestAnimationFrame` loop, load models (state stays `'loading'`), then `state = 'menu'` and `menu.reset()` |
| `stop()` | app, when the rider leaves (and from `closeGame`) | `active = false`, stop the loop, remove **every** listener you added (`window`, menu/results `attach()` detach functions), release GPU memory (`stage.dispose()`), `audio.stopSong()`, `hooks.setGrade(null)`, clear the canvas |
| `input(dir)` | app, on every + / − press (Zwift Click, keyboard, touch on the left/right half of the screen) | dispatch by `state`: `'menu'` → `menu.input(dir)`; `'results'` → `results.input(dir)`; playing → your one action. **Only `+1` or `-1` is ever passed** (a game that receives anything else is broken) |
| `hold(dir)` | app, with `input()` and again with `0` on release | in `'menu'` forward to `menu.hold(dir)` (long press on + starts). While playing, steering games use it for continuous input |
| `end()` | tests, `game:check` | optional; if the run is in progress, finish it as if time were up |
| `eventStats()` | `game:check`, tests | return `{ first, maxGap, perMin, n }` in game seconds; see "Events" |

There is **no `pause()`/`resume()` call**: the app never pauses a game. The rule from the design rules is that someone who
stops pedalling goes into the game's own pause: below about 12 W for 2.5 s the game freezes its clock and says so, and
resumes when the power returns (Tempo shows the pattern). A game never loses because the rider stopped.

### States

`state` is a string the app and the tests read. The four canonical values:

| state | meaning |
|---|---|
| `'loading'` | between `start()` and the menu: models, fonts. Draw a progress, never a blank screen |
| `'menu'` | the shared `GameMenu` is shown (length, level, best, start). `input` goes to `menu.input` |
| `'play'` | the run is on. A game with phases of its own may use other names between `'menu'` and `'results'` (Breakaway: `countdown`, `race`, `finishCam`; Pedal Strike: `intro`, `cool`); nothing outside the game relies on them |
| `'results'` | the shared `ResultsView` is shown: stars, criteria, score, best. `+` plays again, `−` calls `hooks.close()` |
| `'error'` | loading failed (set `this.error = message`); show it and let − leave |

`'menu'`, `'results'` and `'error'` are the ones tools look at: `game:check` waits for `'menu'` to start the bot and for
`'results'` to read the stars.

### The frame loop

Own it: `requestAnimationFrame(this.loop)`, `dt = Math.min(0.05, (now - last) / 1000)`, then `update(dt)` and the drawing.
Clamp `dt`: a background tab returns after minutes. Use the `now` that `requestAnimationFrame` passes, and
`performance.now()` for clocks, nothing else (the bot harness replaces both with a fake clock to run a 5-minute session in
seconds). Draw the HUD with the shared helpers in `kit/hud.js` (`txt`, `panel`, `uiScale`, `hudView`: text that shrinks to
fit and never overlaps); it keeps every phone size legible. Leave the top 56 px free: the app's own bar (title, audio, exit) is there.

## What the app gives a game: `hooks`

The second constructor argument. This is the **complete** list.

| hook | type | meaning |
|---|---|---|
| `connected()` | `() => boolean` | a trainer is connected. `false` = demo (in development: the demo rider answers `true`) |
| `stats()` | `() => { power, cadence, gear, heartRate }` | `power` W (integer 0–2500), `cadence` rpm (integer), `gear` 1-based virtual gear in Gears mode else `null`, `heartRate` bpm or `null` |
| `ftp()` | `() => number` | the rider's FTP in watts. Everything is in % of it: `Math.max(80, hooks.ftp?.() \|\| 200)` |
| `speedKmh()` | `() => number` | speed, km/h (virtual speed in Gears mode) |
| `shift(dir)` | `(±1) => void` | virtual gear up/down (Gears mode): the way a game reacts to + / − when its own action is "pedal harder / easier" |
| `setGrade(g)` | `(number\|null) => void` | slope sent to the trainer, % (−10…15, scaled by the rider's "climb realism"). `null` gives control back; call it in `stop()`. Ignored while a workout runs (ERG stays on the workout's watts) |
| `workout()` | `() => WorkoutInfo\|null` | the workout in progress under the game, or `null` (see "Workout mode") |
| `workoutHud` | `boolean` | `true`: the game shows the workout step in its own HUD (the app's strip is then hidden) |
| `runStart()` | `() => void` | call when a run really starts: the app starts timing it |
| `runEnd(r)` | `({ game, stage?, score }) => void` | call when a run ends **only if the game has a leaderboard** (the app submits `score` for `game` when the rider is signed in, ≥ 20 s, trainer connected) |
| `close()` | `() => void` | back to the games list (the `−` button on the results screen) |
| `progress` | `Progress` | shared progress (js/games/progress.js): see "Storage" and "Toasts" |

Types and units: power in watts, cadence in rpm, heart rate in bpm, speed in km/h, grade in %, time in seconds. Read hooks
every frame, do not cache them: values change, and tests replace them.

### Audio

The third argument, `audio` (js/games/audio.js; skip it if `noAudio`). `audio.ensure()` unlocks sound (call it in your
first `input`), `audio.sfx(name)` plays a sound effect, `audio.playSong(SONGS.x)` / `audio.stopSong()` the background music.
Names that exist: `select pickup coin rescue go win lose alarm beep boost whoosh cheer pass shiftUp shiftDown bell shot hit
boom jump land hurt overdrive` (and more in `synth()`). Every action needs an answer within 100 ms: a sound is the cheapest.
The rider can mute everything; never assume sound is heard.

### i18n

`import { t } from '../../i18n.js'` (path relative to your file) and `t('games.<id>.key', { n: 3 })` for every word the
rider sees, with `{n}` placeholders; add the key to **all five** `locales/*.json` (`node tests/i18n-check.mjs` fails
otherwise). Text is measured in the HUD (`txt(..., { maxW })` shrinks it), so German and French lengths fit.
Call `t` at draw time, not in constructors: the language can change while a game is open.

### Quality level

3D games create `new Quality()` (`kit/quality.js`) and pass it to `new Stage(canvas, { quality })`: it reads the rider's
setting (auto / high / medium / low), lowers itself when the frame rate drops, and tells you through
`stage.onQuality = (cfg) => ...` (`cfg`: `pixelRatio shadows shadowMap bloom density crowd`). Scale your world with
`cfg.density` and `cfg.crowd`. 2D games need nothing.

### Storage

A game owns the localStorage keys that start with its id, and nothing else.

- Personal bests: `hooks.progress.bestOf(id, key)` → record or `null`; `hooks.progress.saveBest(id, key, record)`. `key`
  describes the variant (`'0:1'` = length index : level); `record` is a small JSON object (`{ score, stars }`). Stored as `<id>Best:<key>`.
- Menu choices (length, level) are saved by the shared `GameMenu` as `<id>Dur`, `<id>Level`.
- XP, daily challenges, achievements: `hooks.progress.event('kills', 1, 10)` counts a stat and gives XP;
  `setMax(stat, value)`. Existing stats and challenges are in `progress.js`.
- The FTP is `hooks.ftp()`, never `localStorage.getItem('ftp')`. Quality, mute and glow are kit settings: use the kit.

### Toasts

Call `hooks.progress.drawToasts(ctx, W, dt)` at the end of every HUD frame so XP, level-ups and achievements can appear.

### Events: `eventStats()`

The design rules ask for something to do within 8 s and never 5 s without an event. A game records the time (game seconds)
of every event, whatever it is (a target appears, a reward, an obstacle, a block change), and answers:

```js
ev(kind) { this.evLog.push({ t: this.el, k: kind }); }
eventStats() { return { first, maxGap, perMin, n }; }   // seconds, seconds, events per minute, count
```

If a game has no `eventStats()` the harness measures from sounds (`audio.sfx` other than `select shiftUp shiftDown beep`) and
`progress.event` calls. See `tempo.js` for the three-line implementation.

### Results

At the end set `state = 'results'`, `this.result = { stars, ... }` (`stars` 1–3, as the design rules define them), call
`results.reset()` and draw the shared `ResultsView`:

```js
this.results.draw(ctx, W, H, { title, subtitle, stars, criteria: [{ ok, label }], score, best, newBest, lines: [] })
```

## Workout mode

When the rider follows a workout, `hooks.workout()` returns `{ name, total, elapsed, steps: [{ t0, dur, pct, watts, kind, w0, w1, label }] }`
(seconds, fraction of FTP, watts) and the trainer stays in ERG on the workout's watts: **the game does not decide the load,
the workout does**. Use `kit/workout-plan.js`:

- `new WorkoutClock(hooks)`: `begin(ftp)` → plan or `null`; `tick(dt)` → workout time (it follows the app if it jumps); `.ended`.
- `wkTarget(seg, el)`: target watts now. `BAND` (±7 %) and `SETTLE_S` (6 s) define "on target".
- `workoutStars(ratio, finished)`: the same star rule in every game: ★ finished, ★★ ≥ 60 % of the time on target, ★★★ ≥ 85 %.

A game that ignores the plan is not finished: the menu already shows the workout, so the run must follow it, end with it and
give stars by that rule. Personal bests are not saved from a workout run (the load was not the game's).

## What a game must never do

- **Touch Bluetooth or the trainer.** Everything arrives through `hooks`. Only the app talks to devices.
- **Touch the DOM outside its canvas.** No `document.body`, no new elements outside the stage's WebGL canvas, no listeners on
  elements that are not yours. `window` listeners (resize, the menu's `attach`) are allowed and **must be removed in `stop()`**.
- **Use localStorage keys outside its namespace** (see "Storage"), or `sessionStorage`, cookies or IndexedDB.
- **Make network requests.** The app has a strict Content-Security-Policy (`default-src 'none'`; `connect-src` only the app's
  own origin and two named services): a `fetch` to anywhere else is blocked by the browser. Assets are files in the repo
  with a clear licence (CC0 / MIT / OFL, or generated for the project), credited in `README.md` and `docs/legal/licenses.*.md`,
  listed in `sw.js`.
- **Load third-party code or add dependencies.** three.js is vendored; use it through `kit3d.js`.
- **Pass anything but ±1 to `input()`**, or rely on touch: every game must be fully playable with + and − only.
- **Hard-code watts.** Targets are fractions of `hooks.ftp()`.
- **Punish pushing harder or stopping.** No game over in the first minute; stopping pedalling pauses.
- **Leave anything running after `stop()`**: loops, listeners, intervals, audio.
- **Show text that is not in `locales/*.json`.**
