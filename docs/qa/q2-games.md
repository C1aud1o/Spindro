# Games QA, round 2 (night before launch)

Scope: the six 3D games (Breakaway, Horde Run, Pedal Strike, Slipstream, Updraft, Feed Zone) at quality **high** first
(what a phone gets with quality `auto`), then medium and low. Test browser: Chromium with SwiftShader (software GL), so
frame times are only a hint and anything that depends on a real GPU is listed under "needs a real phone".

Method (harness lives outside the repo): fake clock, scripted rider following the plan's segment kinds (seeded, FTP 200),
screenshots every 10 s of game time plus 12-frame bursts at 10 fps (start, first effort, boss, recovery, end, results),
console/CSP/texture-load errors recorded, `renderer.info` sampled every minute.

## Checklist (game × quality × mode: looked / fixed)

Legend: ✓ looked, no defect left · ✓F looked and fixed · – not done yet (see "Not done").

| game | high 5 min | high 20 min Hard | high workout | medium 5 min | low 5 min | 1280×720 |
|---|---|---|---|---|---|---|
| Horde Run | ✓F | – | – | – | – | – |
| Pedal Strike | ✓ (bloom checked) | – | – | – | – | – |
| Breakaway | – | – | – | – | – | – |
| Slipstream | – | – | – | – | – | – |
| Updraft | – | – | – | – | – | – |
| Feed Zone | – | – | – | – | – | – |

## Cross-game defects

| # | what | where / how to see | fix |
|---|---|---|---|
| X1 | Bloom made lit surfaces glow: lime jersey, white helmet, road markings; whole scene hazy | `high` (bloom on), Horde Run and Pedal Strike used the default threshold 0.82 (strength 0.7, radius 0.45); other games overrode it with 0.9–0.93 | One shared preset `BLOOM` in `kit3d.js` (threshold 1.2, strength 0.6, radius 0.3); per-game overrides removed. Measured: lit surfaces stay below ~1.1 in linear space, only sprites/lamps/gems exceed 1.2 |
| X2 | Full-screen red wash for 0.6–1.7 s on every hit / knock-out (Horde Run, Updraft, Feed Zone) hiding rider, horde and road | Horde Run: fall in an effort wave (`hurtT` 2.6 → alpha up to 0.9 over the whole screen) | New `hurtVignette()` in `kit/hud.js`: 150 ms, edges only (alpha ≤ 0.38), centre never tinted. Pedal Strike's flash (already edge-only) shortened to 0.3 s and capped at 0.3 |

## Horde Run (`horde.js`)

| # | what | where | fix |
|---|---|---|---|
| H1 | Gates leaked a label texture, two geometries and two materials each (never disposed) | `spawnGatePair`; `renderer.info.memory.geometries` grew 60 → 128 in 4 minutes | `dropGate()` disposes them (geometries now stay at 47–68) |
| H2 | Red wash (see X2) | effort wave after a fall | see X2 |

Before/after at the effort wave (135 s, FTP 220, 252 W, high, DPR 2): before = rider and horde hidden under pink wash and
glow; after = rider, horde, road and gates clearly visible (frames kept locally, not in the repo).

Observation, not changed: gates pass very close to the camera and fill a side of the screen for a moment (they are
solid blue arches); the 3D gate captions ("2 ALLIES") are partly covered by the HUD banner during the first seconds of a wave.

## Not done yet / needs a real phone

Updated at the end of the session.
