# Horde Run: how the game is built

Code: `js/games/horde.js` (game and graphics), `js/games/horde-plan.js` (the shape of the workout, no graphics),
`js/games/horde-world.js` (graveyard at dusk). General rules: `docs/games/DESIGN-RULES.md`.

## The game is a workout
Pick the length with **−** (5 / 10 / 20 min) and the level with **+** (Easy −10%, Normal, Hard +10%).
Start by pedalling (or by holding + or − for 0.8 s). All the watts asked for are **% of FTP** (`hooks.ftp()`).

| Step | % FTP | What happens |
|---|---|---|
| Start | 62% | 50 s, few zombies, the first within 1–3 s |
| Tempo | 76 → 88% | the wave arrives (a different mix each wave) |
| Effort | 95 → 106% | the horde thickens |
| Sprint | 130% for 10 s | only with the Keeper: if you hold the watts, OVERDRIVE kicks in (double shots that pierce) |
| Recovery | 56% | few enemies, portals and gems |
| Cool-down | 50% | 30 s, summary with the stars |

Waves: 4 (5 min), 7 (10 min), 12 (20 min). The Keeper arrives at the end of every block of 4 waves and in the last one.
Rotating mix: walkers in numbers, runners, brutes, skeletons (they dodge shots).
An **effort** succeeds if for 65% of the time (sprint: 50%) you hold at least 92% of the watts asked.
Adaptation: two failed efforts in a row → targets −5%, three successful → +5%, within ±15%.

## Controls
- Watts → fire rate: `shots/s = weapon base × clamp(watts / (0.8 × FTP), 0.35, 1.8)`.
- **+ / −** steer (tap = side dash, hold = continuous steering). They are used to pick the portal and collect the lines of gems.
- Stop pedalling for 2.5 s → **pause** (the time stops). There is no game over: if you run out of hearts you get a *fall*
  (the horde retreats, you get back up with 4 hearts) and it only counts for the stars.

## Portals
Every 13–17 s a pair of different choices: ally or weapon, fire rate or damage, ally or life, ×2 allies or damage…
A gap is left between the two portals. There are 10 weapons and they also level up with kills (the threshold grows with the length).

## Stars
★ finished · ★★ at least half of the efforts · ★★★ at least 80%, all the Keepers beaten, at most 3 falls.
The summary says what is missing for the next star. Record per length and level in `localStorage` (`hordeBest2:<s>:<level>`).

## How to tune it (if you change something)
The director (`directorTick`) gives the enemies per second for each step (`BASE_RATE`), grows with time and with the strength of the squad
(`strength()`), and has a *pressure* that drops when you are hit and slowly climbs back. The knobs are at the top of `horde.js`
(`FIRE_RANGE`, `SPAWN_Z`, `BASE_RATE`, `PAIRS`) and in the mix of `horde-plan.js` (`COMPOS`).
After every change: `npx playwright test tests/b5-games.spec.mjs` prints the bot table at 4 power levels
(stars, time to the first event, longest gap without events, events per minute, enemies within 40 m).
