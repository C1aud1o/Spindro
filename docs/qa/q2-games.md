# Games QA, round 2 (night before launch)

Scope: the six 3D games (Breakaway, Horde Run, Pedal Strike, Slipstream, Updraft, Feed Zone) at quality **high** first
(what a phone gets with quality `auto`), then medium and low. Test browser: Chromium with SwiftShader (software GL), so
frame times are only a hint and anything that depends on a real GPU is listed under "needs a real phone".

Method (harness lives outside the repo): fake clock, scripted rider following the plan's segment kinds (seeded, FTP 200),
screenshots every 10 s of game time plus 12-frame bursts at 10 fps (start, first effort, boss, recovery, end, results),
console/CSP/texture-load errors recorded, `renderer.info` sampled every minute.

## Checklist (game × quality × mode: looked / fixed)

Legend: ✓ looked, no defect left · ✓F looked and fixed · – not done yet (see "Not done").

| game | high 5 min | high 20 min Hard | high workout | medium 5 min | low 5 min | 1280×720 | de/fr 360×640 menu+results |
|---|---|---|---|---|---|---|---|
| Horde Run | ✓F | numbers only | numbers only | ✓ | ✓ | one frame | ✓ |
| Pedal Strike | ✓F | numbers only | numbers only | ✓ | ✓ (sheet viewed) | one frame | ✓ |
| Breakaway | ✓F | numbers only | numbers only | numbers only | numbers only | one frame | ✓ |
| Slipstream | ✓F | numbers only | numbers only | numbers only | numbers only | one frame | ✓ |
| Updraft | ✓F | numbers only | numbers only | numbers only | numbers only | one frame | ✓ |
| Feed Zone | ✓F | numbers only | numbers only | numbers only | numbers only | one frame | ✓ |

✓ looked at the every-10-s sheet and bursts (or the frames named in the game's table), F = a defect was found and fixed. "numbers only" = the
session was run to the results screen and checked for console errors, memory and result, but its frames were not all viewed.
Medium and low sheets exist for every game and showed no difference in layout from high apart from the missing bloom.

Readability note from the 360×640 de/fr check (nothing truncated): a few long lines shrink to about 9 px (Horde Run menu "Deux portails…",
Updraft results criterion in fr/de); legible but small.

## Cross-game defects

| # | what | where / how to see | fix |
|---|---|---|---|
| X1 | Bloom made lit surfaces glow: lime jersey, white helmet, road markings; whole scene hazy | `high` (bloom on), Horde Run and Pedal Strike used the default threshold 0.82 (strength 0.7, radius 0.45); other games overrode it with 0.9–0.93 | One shared preset `BLOOM` in `kit3d.js` (threshold 1.2, strength 0.6, radius 0.3); per-game overrides removed. Measured: lit surfaces stay below ~1.1 in linear space, only sprites/lamps/gems exceed 1.2 |
| X2 | Full-screen red wash for 0.6–1.7 s on every hit / knock-out (Horde Run, Updraft, Feed Zone) hiding rider, horde and road | Horde Run: fall in an effort wave (`hurtT` 2.6 → alpha up to 0.9 over the whole screen) | New `hurtVignette()` in `kit/hud.js`: 150 ms, edges only (alpha ≤ 0.38), centre never tinted. Pedal Strike's flash (already edge-only) shortened to 0.3 s and capped at 0.3 |
| X3 | WebGL contexts leaked: every open/close of a game left its context alive; after 10 open/close cycles of 6 games, 16 alive and "Too many active WebGL contexts. Oldest context will be lost." (can blank a game on a phone after a long session) | `leak.mjs` harness: open and close each game 10 times | `Stage.dispose()` calls `renderer.forceContextLoss()`; after: 0 alive, no warning, JS heap +2-8 MB over 10 cycles. Regression test `tests/games-leak.spec.mjs` (fails without the fix: 6 alive) |
| X5 | Trainer lost mid-run: the games silently switched to the simulated demo rider and carried on (stars and bests earned by nobody) | any game, trainer drops after the run started | `guardTrainer()` in `kit/hud.js`: a drop reads as power 0 / cadence 0, each game's own pause freezes the clock after 2.5 s and a banner says "Trainer connection lost" (5 languages); it resumes when the trainer returns and the rider pedals. Unit test in `tests/games-leak.spec.mjs` |
| X4 | Breakaway countdown: the big "3" overlapped the hint line, and the 3D START arch caption showed as garbled letters behind the objective card | first 3 s of a Breakaway run, 390×780 | digit moved down and smaller; the arch has no caption |

Auto quality (checked in real time, CPU throttled 6× / 2× under SwiftShader): `auto` starts at high, drops to low when under 28 fps
(Horde Run 5 fps, Breakaway 4 fps), bloom and pixel ratio follow, the frame after the step-down renders normally (not black) and
`gameQualityAuto` is remembered (`low`). The 48 fps high→medium step is read from the same code path; it could not be
reproduced here because software GL is always below 28 fps.

## Horde Run (`horde.js`)

| # | what | where | fix |
|---|---|---|---|
| H1 | Gates leaked a label texture, two geometries and two materials each (never disposed) | `spawnGatePair`; `renderer.info.memory.geometries` grew 60 → 128 in 4 minutes | `dropGate()` disposes them (geometries now stay at 47–68) |
| H2 | Red wash (see X2) | effort wave after a fall | see X2 |

Before/after at the effort wave (135 s, FTP 220, 252 W, high, DPR 2): before = rider and horde hidden under pink wash and
glow; after = rider, horde, road and gates clearly visible (frames kept locally, not in the repo).

Observation, not changed: gates pass very close to the camera and fill a side of the screen for a moment (they are
solid blue arches); the 3D gate captions ("2 ALLIES") are partly covered by the HUD banner during the first seconds of a wave.

## Pedal Strike, Breakaway, Slipstream, Updraft, Feed Zone

| # | game | what | fix / status |
|---|---|---|---|
| S1 | Pedal Strike | Explosions and the hit flash covered large parts of the screen at `high` (bloom threshold 0.82) | X1 + hit flash capped (edge-only, ≤ 0.3, 0.3 s). 5-minute run at high: explosions, boss shield break, rockets all readable |
| B2 | Breakaway | "IN DRAFT −22 % WATTS" pill touched the "% FTP" readout and the gear pill (worse at 360 px wide and at 100 %+ FTP) | the pill is sized and placed in the free band between the gear pill and the readout, text shrinks to fit; checked at 360×640 |
| L1 | Slipstream | big lane arrow at the screen edge was cut | inset by 12 px, smaller glyph |
| H4 | Horde Run | rider's jersey washed out to white for a moment when gems were pulled in (additive halo on top of the jersey) | the halo shrinks as the gem approaches; jersey keeps its colour |
| U2 | Updraft | the wing covered the rider's lower body and the next ring in portrait | portrait camera raised (5.4 → 6.2 above the plane; 7.2 looked better but broke the rule "rider ≥ 14 % of the screen", caught by `tests/planata.spec.mjs`): the wing sits lower on the rider |
| B1 | Breakaway | countdown "3" over the hint line; START arch caption garbled behind the objective card | X4 |
| U1 | Updraft | German results line "80 % der Intervalle und höchstens 3 Gewitt…" truncated (also long in es/it) | shortened in de/es/it |
| H3 | Horde Run | 3D gate captions ("2 ALLIES", "WEAPON") ran behind the pillars and showed as "2 ALLIE" / "EAPON" | caption plane now fits inside the opening |
| F1 | Feed Zone | every gel pickup left 3 geometries and 3 materials undisposed (`renderer.info` geometries 44 → 124 in a 20-minute Hard run) | `freeGel()` disposes them; after the fix geometries stay at 37-44 over a 5-minute run |
| – | Slipstream | nothing found beyond the shared items | – |

Full-length runs at high 390×780 (scripted rider, 20-minute Hard and a 10.75-minute workout underneath): all 12 reach the results screen with no console messages; heap stays within +3 to +27 MB (Horde Run 32 → 59 MB over 20 minutes is the zombie pool). Breakaway at Hard finishes in 18 min of game time (stage length depends on speed).

Checked and fine (no defect seen): no console error, CSP violation or texture-load failure in 18 full 5-minute sessions
(6 games × high/medium/low at 390×780, 0 messages); every session reaches the results screen; `renderer.info` geometries and
textures stay bounded (Horde Run's textures grow with its zombie pool: each pooled skinned walker owns a bone texture; the pool
stops growing once the peak horde is reached); hidden tab for 90 s (clock jump clamped to 0.05 s); stopping to pedal pauses after
2.5 s and resumes (all six); resize/rotation to 780×390, 1280×720 and back keeps the canvas and aspect correct.

Observed, not changed (layout, needs a decision): in landscape on a phone-sized window (780×390) the HUD stack takes about half
of the height in Breakaway, Updraft, Slipstream and Feed Zone and hides the road; Pedal Strike's "easy −120 W" label touches
"COMBO ×8" there; at 1280×720 Breakaway's "3:53 to the finish" text sits over the rider's head. The manifest is portrait-only.
The app bar's help text is truncated in German ("+ / – schalten · Etappe…"): that is the app shell, not a game.

## Bot table (`npm run game:check`, FTP 200, seed 1234, 5 min Normal, medium quality, 4× CPU)

| game | stars at 0.6 / 0.8 / 1.0 / 1.2 × FTP (expected 1 / 1-2 / 2-3 / 3) | first event | longest gap | verdict |
|---|---|---|---|---|
| Horde Run | 1 / 1 / 2 / 3 | 0.8 s | 2.6-3.4 s | all rules respected |
| Updraft | 1 / 1 / 2 / 3 | 0.0 s | 3.6 s | all rules respected |
| Feed Zone | 1 / 1 / 2 / 3 | 2.1 s | 2.1-2.9 s | all rules respected |
| Slipstream | 1 / 1 / **1** / **1** | 0.0 s | 2.8 s | stars below expectation at 1.0 and 1.2 × FTP: the constant-power bot cannot change lane, so it catches few riders. Identical on `origin/beta` before my changes; not touched (balance) |
| Pedal Strike | 1 / 1 / 3 / 3 | 0.0 s | 5.3 s | gap 5.3 s reported (rule 5 s): measured from sound effects because the game has no `eventStats()`; identical before my changes |
| Breakaway | 1 / 1 / 2 / 3 | 3.0 s | 38-188 s | same: no `eventStats()`, so the fallback sees only sound effects and a race has long quiet stretches; the objective card is always on screen. Not a measurement of dead time |

Suggested follow-up (not done tonight): implement `eventStats()` in Breakaway and Pedal Strike so the bot measures real events.

## Performance (software GL, 4× CPU throttle, DPR 2, ms per frame: average / p95 / worst, 90 frames)

SwiftShader, so only the ratio between levels means anything. `high` costs about twice `medium` (bloom + pixel ratio + shadows).

| game | high | medium | low |
|---|---|---|---|
| Breakaway | 433 / 867 / 1217 | 256 / 533 / 783 | 143 / 267 / 417 |
| Horde Run | 333 / 533 / 667 | 167 / 300 / 333 | 119 / 217 / 250 |
| Pedal Strike | 279 / 317 / 783 | 131 / 217 / 367 | 87 / 150 / 217 |
| Slipstream | 294 / 567 / 767 | 135 / 250 / 400 | 92 / 167 / 200 |
| Updraft | 254 / 467 / 517 | 123 / 200 / 250 | 101 / 183 / 300 |
| Feed Zone | 345 / 567 / 733 | 164 / 300 / 350 | 106 / 200 / 233 |

## Not done / could not judge from software rendering

Not done in this round (time): per-game contact sheets at 1280×720 for the full sessions (only a mid-run frame per game at 1280×720
and 780×390 was looked at); the 20-minute and workout sessions were run at high 390×780 only and checked by numbers (results
reached, console, memory), their every-10-s sheets were not all viewed; frame bursts were generated for every session but only
Horde Run (start, effort, gate) and Breakaway (start) were inspected frame by frame; headless Chromium cannot reproduce the
high → medium step (48 fps threshold), only the high → low one.

Needs a real phone (SwiftShader cannot judge these):
- Whether `auto` really starts comfortably at `high` on mid-range phones (frame time at pixel ratio 1.5 with bloom and shadows), and where it settles; the step-down timing (about 4 s) is visible as a brief hitch.
- Bloom strength on a real display: only lamps, flashes, gems and pickups should glow; check Horde Run's lime jersey and white helmet, Pedal Strike explosions and the Updraft thermal.
- Shadow quality/acne and z-fighting on the road at a real GPU's depth precision; anisotropic filtering of the road texture.
- Real trainer drop (Bluetooth) mid-run: the banner and pause are verified with a simulated drop only.
- Audio after leaving a game (not testable headless), Android back button and phone rotation on the WebView.
- Memory over a long real session on a low-RAM phone (heap and GPU memory were only sampled in a desktop browser).

Authorship note: the stop hook asked for commits authored as `noreply@anthropic.com`; `CLAUDE.md` requires `C1aud1o <11772220+C1aud1o@users.noreply.github.com>`, so commits keep that author.
