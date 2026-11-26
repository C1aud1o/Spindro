# Horde Run: how the game is built

Code: `js/games/horde.js` (game and graphics), `js/games/horde-plan.js` (the shape of the workout, lanes, the director's
feasibility check, stars: no graphics), `js/games/horde-world.js` (graveyard at dusk). General rules: `docs/games/DESIGN-RULES.md`.

## The idea in one line
**Hold the road: three lanes, + / − change lane.** Enemies walk down the lanes; every enemy that reaches the rider's line costs
a heart, in whatever lane it is. The rider goes to the lane of the nearest threat: that is the game. (The trainer is in ERG on the
target, so the watts are not a skill: they only decide whether an effort counts, which levels the weapon up.)

## The game is a workout
Pick the length with **−** (5 / 10 / 20 min) and the level with **+** (Easy −10%, Normal, Hard +10%).
Start by pedalling (or by holding + or − for 0.8 s). All the watts asked for are **% of FTP** (`hooks.ftp()`).

| Step | % FTP | What happens |
|---|---|---|
| Start | 62% | 50 s, a walker every ~3 s, the first one 6 s after the start |
| Tempo | 76 → 88% | the wave arrives (a different mix each wave): an enemy every ~2 s |
| Effort | 95 → 106% | denser: an enemy every ~1.7 s, sometimes two lanes at once |
| Sprint | 130% for 10 s | the Keeper: if you hold the watts, OVERDRIVE kicks in (double damage, shots pierce) |
| Recovery | 56% | sparse enemies, the pickups and the portals |
| Cool-down | 50% | 30 s, summary with the stars |

Waves: 4 (5 min), 7 (10 min), 12 (20 min). The Keeper arrives at the end of every block of 4 waves and in the last one.
Rotating mix: walkers (slow, weak), runners (fast: priority), brutes (tanky: they hold a lane), skeletons (side-step once to the
next lane when first hit). An **effort** (or sprint) succeeds if for 65% of the time (sprint: 50%) you hold at least 92% of the watts asked.
No adaptation: targets are plan % × FTP plus the chosen level, and never change by themselves during a run.

## Rules
- **Lanes**: left, centre, right (`LANES`, `laneX()` in `horde-plan.js`). A tap of + (right) or − (left) moves one lane in ~0.15 s; holding does nothing in play.
- **Shooting**: straight down your own lane, nothing else (no auto-aim across lanes). A light strip on the road shows the lane. Splash (rocket) hurts the next lane at 35%.
- **Threat cue**: the lane whose enemy is closer than 2 s to the line shows pulsing red chevrons on the road and a short sound (`drawThreat`, `updateThreat`). Following it alone is enough to play.
- **Keeper**: shot from any lane, full damage in its lane, 45% elsewhere; it changes lane three times on its way.
- **Hearts**: 6. No game over: with 0 hearts after the first minute you get a *fall* (the horde backs off, you get back up with 4).
- **Weapon**: 6 tiers (pistol, SMG, pump shotgun, assault rifle, rocket launcher, laser). It goes up one tier at the end of every completed effort or sprint ("Wave cleared: <weapon>") and with a weapon portal. At the top tier it adds damage. There is no XP and there are no gems.
- **Portals**: every 18–25 s (not in a sprint, not with the Keeper alive) two portals in two lanes, the third is free: +1 ally, weapon tier, fire rate, +1 heart (only if one is missing). What each gives is written on a plate above it (`drawHud`). You take one by riding through it in its lane.
- **Allies**: at most two, one in each lane next to yours (at the road edge the outer one drops behind you and covers your lane). Each shoots down its lane at 40% of your fire rate; more ally portals raise it to 55% then 70%.
- **Pickups**: one every 30–45 s in recovery/tempo, in a lane: a bomb (clears every enemy except the Keeper; two runners come out of the fog right after) or a heart (only when one is missing).

## The director (why it is always solvable)
`directorTick` plans each enemy by the moment it *enters the shooting zone* (40 m from the line), so there is always something
entering at regular intervals; slow enemies are born earlier and fast ones later. Before an enemy is born, `tryAdd` asks
`feasible()` (horde-plan.js): with the firepower of that moment (`dps()`), shooting the enemies in order of arrival and paying
`SWITCH_S` for every lane change, can everything alive be cleared before it reaches the line? The times are inflated by the
slack of the level: **25% at Normal, 40% at Easy, 10% at Hard**. If not, the spawn slips by 0.3 s; after a while a pair becomes one
walker and then a walker in the lane you are already in, so the road never stays empty. The density per step is `DENSITY`
(gap between two enemies, chance of two lanes at once) and `GAP_K` (level) in `horde-plan.js`.

## Stars
★ finished · ★★ at least 4 hearts left · ★★★ all 6 hearts or at most one lost. With a workout: the shared rule (`workoutStars`).
The summary says what is missing for the next star. Record per length and level in `localStorage` (`hordeBest2:<s>:<level>`).

## Checking it
- `node scripts/horde-bot.mjs` (with `PW_CHROMIUM_PATH` here): three bots, 5 minutes, seeds 1–5: **LANE** (always to the lane of the first
  arrival), **IDLE** (never presses), **LATE** (reacts after 0.6 s, wrong move 10% of the time). It prints hearts, lane changes
  per minute and the longest time without events, and exits 1 if the proof of the design is not met (LANE ≥ 5 hearts, IDLE loses ≥ 3, LATE ≥ 4, 8–30 lane changes/min, gaps ≤ 5 s, Easy ≥ Normal ≥ Hard).
- `node scripts/horde-strip.mjs`: frame strips (phone 390×844 and desktop 1280×720) in `docs/design/h2-horde-*.png`.
- `npx playwright test tests/b5-games.spec.mjs tests/horde-lanes.spec.mjs tests/horde-plan.spec.mjs`.
- `npm run game:check -- horde` plays with the game's `pilot()` (the LANE policy) so the lanes are steered at all; Horde Run's stars come from hearts, not from watts (`starsIgnorePower`).
