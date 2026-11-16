// JSDoc typedefs for the game interface. Nothing runs here: it exists so editors (VS Code, WebStorm) autocomplete the
// hooks and the interface without TypeScript. Use them in your game:
//
//   /** @param {HTMLCanvasElement} canvas @param {import('./types.js').GameHooks} hooks @param {import('./types.js').GameAudio} audio */
//
// The contract in prose, with the rules a game must never break: docs/games/API.md.

/**
 * Live readings of the rider. Zero when no trainer is connected (check `hooks.connected()`).
 * @typedef {Object} RiderStats
 * @property {number} power      watts, integer, 0-2500 (smoothed by the app; 0 while not pedalling)
 * @property {number} cadence    rpm, integer
 * @property {number|null} gear  virtual gear 1-based in Gears mode, otherwise null
 * @property {number|null} heartRate  bpm, integer; null without a heart-rate sensor
 */

/**
 * One step of the workout the rider is following under the game.
 * @typedef {Object} WorkoutStep
 * @property {number} t0      start, seconds from the start of the workout
 * @property {number} dur     duration, seconds
 * @property {number} pct     average intensity as a fraction of FTP (0.75 = 75 %), already scaled by the chosen intensity
 * @property {number} watts   average watts of the step
 * @property {string} kind    'warm' | 'pace' | 'effort' | 'sprint' | 'rest' | 'cool'
 * @property {number} w0      watts at the start of the step (ramps)
 * @property {number} w1      watts at the end of the step (ramps)
 * @property {string} [label] name of the step
 */

/**
 * @typedef {Object} WorkoutInfo
 * @property {string} name      workout name
 * @property {number} total     total duration, seconds
 * @property {number} elapsed   seconds already done
 * @property {WorkoutStep[]} steps
 */

/**
 * Personal bests and progress shared by all games (js/games/progress.js).
 * @typedef {Object} GameProgress
 * @property {(id: string, key: string) => (Object|null)} bestOf   record saved for game `id` and variant `key` (e.g. '5:normal')
 * @property {(id: string, key: string, record: Object) => void} saveBest   keeps `record` in the game's own namespace
 * @property {(stat: string, amount?: number, xp?: number) => void} event   counts a stat (daily challenges, achievements) and gives XP
 * @property {(stat: string, value: number) => void} setMax
 * @property {(ctx: CanvasRenderingContext2D, W: number, dt: number, y0?: number, still?: boolean) => void} drawToasts   call at the end of every HUD frame
 */

/**
 * Everything the app provides to a game, in the second constructor argument. This is the whole list: a game must not
 * reach for anything else (Bluetooth, DOM outside its canvas, other localStorage keys, network).
 * @typedef {Object} GameHooks
 * @property {() => boolean} connected       a trainer is connected (false = demo: use `speedKmh`/`stats` anyway, they are simulated or zero)
 * @property {() => number} ftp              rider's FTP in watts (≥ 80 in practice; use `Math.max(80, hooks.ftp?.() || 200)`)
 * @property {() => RiderStats} stats        current power / cadence / gear / heart rate
 * @property {() => number} speedKmh         speed in km/h (virtual speed in Gears mode)
 * @property {(dir: -1|1) => void} shift     virtual gear up (+1) or down (−1) in Gears mode; the way a game reacts to + / −
 * @property {(grade: number|null) => void} setGrade   slope sent to the trainer, % (−10..15). `null` gives control back. Ignored while a workout runs
 * @property {() => (WorkoutInfo|null)} workout   workout in progress under the game, or null. Read it with kit/workout-plan.js (`WorkoutClock`)
 * @property {boolean} workoutHud            true: the game shows the workout step in its own HUD (the app strip stays hidden)
 * @property {() => void} runStart           call when a run really starts (the app starts timing for leaderboards)
 * @property {(r: {game: string, stage?: number, score: number}) => void} runEnd   call when a run ends; the app submits the score to the leaderboard of `game` if it has one
 * @property {() => void} close              back to the games list ("−" on the results screen)
 * @property {GameProgress} progress
 */

/**
 * Sound effects and music shared by all games (js/games/audio.js). Third constructor argument.
 * @typedef {Object} GameAudio
 * @property {(name: string) => void} sfx      one of: 'select' 'pickup' 'go' 'win' 'beep' 'shiftUp' ... (see audio.js)
 * @property {(name: string) => void} jingle
 * @property {() => void} ensure               unlock the audio context (call in the first input)
 * @property {() => void} stopSong
 * @property {(song: Object) => void} playSong
 */

/**
 * The interface a game class implements. The app builds it once (`new Game(canvas, hooks, audio)`), calls `start()` when the
 * rider opens it, `stop()` when they leave, and forwards the buttons. Full lifecycle in docs/games/API.md.
 * @typedef {Object} GameInterface
 * @property {boolean} active                  true between start() and stop(); the app only forwards input while it is true
 * @property {'loading'|'menu'|'play'|'results'|'error'|string} state   see docs/games/API.md, "States"
 * @property {() => (void|Promise<void>)} start     open: build, start the frame loop, show the menu. May be async (loading models)
 * @property {() => void} stop                       leave: stop the loop, detach listeners, release GPU memory, `hooks.setGrade(null)`
 * @property {(dir: -1|1) => void} input             + / − pressed: always exactly +1 or −1; behaviour depends on `state`
 * @property {(dir: -1|0|1) => void} [hold]          + / − held (dir) or released (0): used by the menu's long-press and by steering games
 * @property {() => void} [end]                      finish the run now and show the results (tests and the bot harness use it)
 */

/**
 * @typedef {Object} GameEntry   an entry of js/games/registry.js (built with `defineGame`)
 * @property {string} id
 * @property {string} icon
 * @property {() => Promise<new (canvas: HTMLCanvasElement, hooks: GameHooks, audio?: GameAudio) => GameInterface>} load
 * @property {boolean} noAudio
 * @property {boolean} dev
 * @property {string} cls
 * @property {string} name       i18n key `games.<id>.name`
 * @property {string} pitch      i18n key `games.<id>.desc`
 * @property {string} controls   i18n key `games.<id>.help`
 */

export {};
