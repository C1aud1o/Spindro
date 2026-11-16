# Breakaway: how the stage works

A stage race with 8 riders. The game is a **workout in % of the player's FTP**: it works the same for someone with 120 W as for someone with 320 W.
General rules: `docs/games/DESIGN-RULES.md`. Code: `js/games/racer-sim.js` (logic, no three.js) and `js/games/racer3d.js` (scene, camera, captions).

## Length and level
- **5, 10 or 20 minutes** (in the menu: − changes the length, + starts; the buttons can also be tapped). 5 min = Sunset Coast, 10 min = Autumn Hills, 20 min = Cloud Pass.
- The race lasts the chosen length minus 30 s: the last **30 s are the cool-down** (podium and summary, the trainer goes back to flat).
- **Easy / Normal / Hard** = −10% / 0 / +10% on all percentages (the pace of the bunch and the targets). Adaptation: after two failed efforts in a row −5%, after three successful ones +5% (within ±15%), saved for the next stage.

## The moments (announced ~10 s ahead, with the card at the top)
| Moment | What to do (Normal) | What happens |
|---|---|---|
| Start in the bunch | stay in the bunch, 70–85% FTP | in the slipstream you need 22% fewer watts |
| **Breakaway** | 105% FTP for 40 s | two rivals attack, the bunch lets them go, then chases |
| Recovery | 55–65% FTP, in the slipstream | the bunch closes up again |
| **Intermediate sprint** | sprint at 130% FTP for 10 s in the last ~170 m | 5-3-1 points (green jersey) |
| **Climb with KOM** | 90% FTP | 5-3-1 points (polka-dot jersey); the gradient reaches the trainer |
| Chase (10/20 min) | catch the climber who rides off from the top | |
| **Final sprint** | 110% FTP for 25 s, then a sprint | the finish |

Never more than 90 s above threshold without recovery: the efforts are 40 s (breakaway) and 10 s (sprint), then you recover. The commentator (short captions) says what is happening ("Lia attacks!", "Bunch dropped: 7 s lead") and, if nothing happens for 4 s, reports the gaps or the time left.

## Rivals scaled to the player's FTP
The bunch follows a pace script expressed as equivalent power in % of the player's FTP. Each rival has a profile (rouleur, sprinter, climber) = base strength × a factor per moment (climbers strong on climbs and in breakaways, sprinters in sprints). Speed in the game is a single curve (power ÷ FTP, gradient) for everyone, player and rivals. So **at 0.8 × FTP you stay in the bunch, at 1.0 × you fight for the podium, at 1.2 × you win**, whatever the FTP.
Tuning knobs (in `TUNE`, `racer-sim.js`): rival strength, bunch cohesion, "the bunch waits" at the start and in recoveries, "the bunch chases" whoever rides away.

## Stars (at the end of the stage)
★ finish the stage · ★★ at least 60% of the targets, or the podium · ★★★ all the targets, or 70% and the podium.

## How to try it
- Without a browser: `node scripts/racer-sim-check.mjs --min=5` (4 power levels, placing/stars/events). `--min=10`, `--min=20`, `--level=0|2`.
- In the real game (Playwright bot, 1/30 s steps): `node tests/serve.mjs &` then `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/racer-bot.mjs` (`--powers=0` = a "coach" that does what the card asks).
- Frame strips: `scripts/racer-strip.mjs --at=<race second> [--pw=0]` (then join them with a montage script).
- Performance: `scripts/racer-perf.mjs`.
