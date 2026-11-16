# Slipstream: how the game is built

Code: `js/games/gruppetto.js` (game, graphics, interface; id `gruppetto`), `js/games/slip-plan.js` (the shape of the
workout and the "bridge" rules, no graphics), `js/games/slip-world.js` (road, fields, objects along the route).
Lengths, levels, adaptation and stars follow `docs/games/DESIGN-RULES.md`; the plan reuses `Adapter`, `segAt`, `targetW` from `horde-plan.js`.

## The idea
You are on a three-lane country road. A rider ahead of you **attacks**: you reach them with your watts (the metres left
are on the bar), and when you catch them they join your slipstream. **The group behind you is the score.**
In the headwind you must hold the watts, otherwise whoever is in your slipstream drops off. There is no losing: if a bridge fails, that rider
rides away and another one arrives; if you stop pedalling the game pauses (the time stops).

## The game is a workout
Length with **−** (5 / 10 / 20 min), level with **+** (Easy −10%, Normal, Hard +10%), start by pedalling or by holding + / −.
All the watts are **% of FTP** (`hooks.ftp()`). Without a trainer the demo simulates 0.8 × FTP with sprints and steers the lane by itself.

| Step | % FTP | What happens |
|---|---|---|
| Start (50 s) | 62% | the first rider is already 18 m ahead (shown in the menu): to be caught within 30 s. Bottles to collect |
| Hold (headwind) | 76 → 88% | whoever is in the slipstream stays only if you hold ≥ 90% of the watts asked; meanwhile the next rider is born in the fog and comes closer |
| Bridge (effort) | 95 → 106% | the rider (or a small group, 1 → 3) attacks at 20 m: close the gap before the end of the step |
| Sprint | 130% for 10 s | at the end of a block (every 4 waves) and in the final: a small group ahead and the finish (Meshy arch) |
| Recovery | 56% | the group stays together at easy watts, bottles to collect |
| Cool-down (30 s) | 50% | summary with the stars |

Waves: 4 (5 min), 7 (10 min), 12 (20 min). Never more than 90 s above threshold in a row (checked in the test).
Adaptation: two failed bridges in a row → targets −5%, three successful → +5%, within ±15%.

## How a bridge is closed
- `closingSpeed(watts, asked, ftp, gap0, duration)`: at the watts asked, the gap (20 m) closes in 70% of the step's duration;
  below half of FTP nothing is recovered; capped at 1.6 × (no endless reward).
- At **3 m** (one bike length: no models passing through each other) the rider is caught **only if you are in their lane**;
  otherwise the gap stops and the ◀ / ▶ arrow appears. Halfway through the bridge the rider changes lane once.
- Bridge succeeded: the rider joins the slipstream (columns on both sides, rows of two; the newcomer goes in front, the others slide back; in the menu
  and at 390×780 you see 4–6 of them, the rest are behind the camera and count in the GROUP number).
- Bridge failed: the rider accelerates and disappears into the fog (born and dies beyond 110 m, never near the camera).

## Controls
**+ / −** change lane (one thing only): they are used to catch the rider and for the bottles (+10, +2 for every rider in the slipstream).
In the menu: − changes the length, + changes the level, a long press of + starts (like Horde Run).

## Events (measured in the test)
Always something to do: every 2.8 s a *pace check* (in the zone: points ∝ group; below: "more watts"), lines of bottles every ~3 s
in the steps without effort, rider spawn, approach, attack, lane change, caught, dropped, finish.

## Stars
★ finished · ★★ at least half of the bridges (sprints included) · ★★★ at least 80%, final sprint won, at most 3 riders lost.
The summary says what is missing for the next star. Record per length and level in `localStorage` (`slipBest:<s>:<level>`).

## How to tune it
The knobs are in `slip-plan.js` (`BASE_PCT`, `MARGIN`, `CLOSE_MAX`, `HOLD_PCT`, `DROP_AFTER`, plan shape) and at the top of
`gruppetto.js` (camera `CAM_*`, gap, group rows). Test: `tests/slip.spec.mjs` (bot at 0.6 / 0.8 / 1.0 / 1.2 × FTP with a fixed seed).
