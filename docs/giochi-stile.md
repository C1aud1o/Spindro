# Spindro 3D game style

One style for all games. It comes from **low-poly CC0 models** (Quaternius, Kenney) and from the code shared in
`js/games/kit/`. The reference game is **Breakaway** (`js/games/racer3d.js`; formerly called Turbo Pedali in older code and comments):
screenshots are in `docs/giochi-shots/`.

## 1. Idea
A bright toy, a summer afternoon, real racing. Simple shapes, solid colours, warm light.
Never realistic, never gloomy. No logos, names or characters from other games.

## 2. Palette (`PALETTE` in `kit/style.js`)
| Use | Colours |
|---|---|
| Brand, player, important numbers | lime `#d9ff3d`, ink `#15141b` |
| HUD accents | cyan `#4de3ff` (slipstream, sprint), gold `#ffd34d` (warnings), red `#ff5a6a` (hard climb, finish) |
| Opponents (jerseys) | 10 saturated colours, one per rider, never lime |
| World | grass `#86b84f`/`#5f9440`, asphalt `#5a5960`, dirt `#c08a5b`, rock `#a99a8c` |

Rule: lime belongs to the player. In the world the colours are more muted than the characters.

## 3. Light, sky, fog
- Three **times of day** (`TIMES`): `morning`, `golden`, `dusk`. One per level.
- **Gradient sky** with a sun halo (`skyDome`): top, horizon, bottom.
- **Light**: hemisphere (sky/ground) + one sun with shadows that follows the player (`styleLights`).
- Linear **fog** in the horizon colour (`styleFog`, 80–520 m): hides the far end and gives depth.

## 4. Materials
- **Toon** with a 3-tone ramp (`toonMaterial`): the sun casts sharp shadows, the hemisphere gives a light gradient.
- Vertex colours instead of textures whenever possible: one geometry, one material, one draw call.
- Only small textures (32×32 palette, captions drawn on the fly).

## 5. Camera
- FOV 60° (up to ~75° in a sprint: you feel the speed).
- Soft chase 5–6 m behind, 2 m above, looking 20 m ahead: the horizon is visible.
- **Hard cuts** for special moments (finish, podium), not slow dollies.
- **Trauma shake** (`Shake`): bump 0.55, item 0.35, whoosh 0.3. Never while the player is reading the numbers.

## 6. HUD (on the bike, phone at 1 m)
- Key numbers **≥ 44 px** (watts and position 58 px), labels ≥ 13 px, heavy condensed font, dark outline.
- Fixed corners: position top left, **watts** top right (colour = zone), distance in the centre,
  gradient in a coloured box, gear under the position, profile at the bottom.
- Semi-transparent panels, never full screen during the race.
- Names above nearby opponents: at most 4, without overlaps.

## 6b. Fonts and text that does not overlap (kit/hud.js)
**Fonts** (OFL, self-hosted in `assets/fonts`, `@font-face` in `css/style.css`, licences in `docs/legal`):
- **Lilita One** (`FONT_DISPLAY`): titles and numbers. It exists only in 400: do not ask for bold.
- **Nunito** 700/900 (`FONT_TEXT`): instructions, rules, long sentences. Chosen with `font: 'text'`.
- No monospace in the games. `hudText` in `engine.js` is now the same `txt` as the kit, so the games that use it inherit the font and the shrinking.

**Usage rules** (valid for all games):
1. Every HUD frame starts with `hudView(ctx, W, H)`: it declares the safe zone (10 px margin). From there `txt()` shrinks itself
   (down to 60%, then adds "…") to fit between `x` and the edge; `maxW` imposes a tighter limit (e.g. inside a box).
2. Paragraphs: `paragraph(ctx, text, x, y, { size, maxW, maxH, maxLines })` wraps on words, breaks words that are too long and,
   if needed, reduces the font size to fit `maxH`. It returns `{ bottom }` so the next block can be placed after it. `wrapLines()` to measure first.
3. Centre-screen messages: **never** your own list. `const q = new MessageQueue()`; `q.say(text, { color, prio, dur, big, sub })`;
   `q.update(dt)` on every step and `q.draw(ctx, W, H, { u, y })` in the HUD. One message at a time; `prio` 0 chatter, 1 normal, 2 big,
   3 finish/important warnings; a message with priority ≥ +2 interrupts the current one; a message that waits more than 3 s (`maxWait`) disappears;
   the same `key` is not queued twice. `Base3D.say(text, color, duration, big, prio)` and the `say` of Breakaway and Horde Run already use it.
4. Names and labels attached to 3D objects: compute the position and clamp x inside the screen (`clamp`), like `drawTags` in Breakaway.
5. Check: `node scripts/design-shots-games.mjs [racer|horde|gruppetto]` and `node scripts/design-shots-d8.mjs [planata|mattoni|shooter] [--lang=it,de]` take screenshots of the menu and the game at 390×780 and 1280×720 in `docs/design/`.

## 7. Juice: every event is seen and heard
| Event | Effect |
|---|---|
| Coin | spark, "+1" text, sound |
| Item picked up / used | particle burst, hit-stop 0.05 s, shake, wider FOV |
| Slipstream | light wedge on the asphalt behind the rider ahead, wind lines, "whoosh" |
| Overtake | sound, text; in the last 400 m a moment of slow motion |
| Last 500 m | banner, bell |
| Finish | 0.22× slow motion for ~2 s, confetti, camera cut |
| Podium | riders standing, arms up, confetti, cheering |
| + / − | gear highlighted in the HUD, shifter click |

Particles use the Kenney textures in `assets/fx`. Sounds are synthesised in `js/games/audio.js`.

## 8. Performance
- Target **60 fps** on an average Android phone, **minimum 30**.
- **Draw calls < 150**: instances for everything that repeats (`kit/env.js`), the character in a single mesh.
- Triangles in view < 250k (high), < 120k (low).
- **Optimised .glb models** (gltf-transform: weld, simplify, quantize, meshopt). Small textures.
- **Automatic quality** (`kit/quality.js`): the frame rate is measured in the first seconds and the level drops if needed.

| Level | Pixel ratio | Shadows | Glow | Object density | Crowd |
|---|---|---|---|---|---|
| High | 1.5 | 1024 | yes | 100% | 100% |
| Medium | 1.0 | 512 | no | 70% | 60% |
| Low | 0.75 | no | no | 40% | 30% |

It can be fixed in *Games → Graphics quality*.

## 9. Assets
- Only CC0 / MIT / OFL, with a `License.txt` in the folder and credits in the README and `docs/legal/licenses.*.md`.
- Characters: `assets/3d/quaternius/cyclist.glb` (real skeleton) and `fan.glb` (light version for the crowd).
  Poses are computed on the bones (leg IK on the pedals), jerseys are coloured per vertex.
- Weight of new game assets: keep each addition under 6 MB.

## 10. Measuring performance
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/game-shots.mjs --fps` (stage 2, climbing among the crowd, CPU throttled 4×).
In the cloud there is no GPU (SwiftShader draws on the CPU), so the fps of the test browser (0.4–3) say nothing about a phone.
What is measured is the CPU cost per frame (logic, bone poses, draw preparation, HUD) and the load on the GPU.

Reference values for Breakaway (390×844, CPU 4×): high 22.9 ms/frame, 117 draw calls, 318k triangles; medium 19.6 ms, 102, 240k; low 11.8 ms, 66, 139k.
Draw calls stay under 150. The real frame rate must be checked on an average Android phone: automatic quality drops a level by itself
if the first seconds run below 48 fps. Each game has its own `scripts/<game>-shots.mjs [--fps]` that prints the same numbers.

## 11. Per-game visual notes

### Horde Run (graveyard at night)
A declared exception to the "never gloomy" rule: it is set in a graveyard at night but stays readable (moon, light fog, street lamps, asphalt with light edges).
- **Enemies** (Meshy, automatic skeleton): near ones have bones and procedural animation (`kit/walkers.js`: staggering walk/run, arms forward, hit, fall backwards); far ones are baked-pose instances of ~1,000 triangles (`*-lo.glb`) whose legs swing in the vertex shader. Cap on enemies with bones: high 26, medium 16, low 9.
- **Player and allies**: Meshy cyclist with the bike (allies use the light model `fan-lo.glb`), a Meshy blaster on the handlebars that changes colour and size with each weapon.
- **World** (`horde-world.js`): endless road, instanced deterministic scenery (gravestones, fence, crypt, dead trees, street lamps), 3 point lights on the nearest lamps (1 on low quality), portals with a Meshy stone arch (blue or red energy).
- **HUD**: one line at the top (score, wave, hearts), at the bottom the power with a 56–64 px number, the weapon and the evolution bar. No circles or rings under the characters.
- Measurements and screenshots: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-shots.mjs [--fps]` (screenshots in `docs/giochi-shots/horde-*.png`).

### Updraft (internal id `planata`)
Same style as the other games; gameplay is watts = altitude, gates, ridges, bridges.
- **Plane**: Meshy model (`assets/3d/meshy/plane.glb`, 3,200 triangles) with a propeller that spins at the cadence (blades + a blurred disc at high cadence), nose up and down with altitude, shadow on the ground.
- **World** (`planata.js`): terrain made of recycled chunks with vertex colours (patchwork and striped fields, woods, rock, sandy shore), a flat valley in the middle and hills at the sides, lakes every ~300 m (toon water plane). The shape depends only on position, so it is always the same.
- **Instances** (one per model, rewritten for each new chunk): Quaternius trees and bushes, cypresses, Meshy houses/church/huts/mill in villages, Meshy clouds (`cloud.glb`) high and low, floating lighthouse islands (`island.glb`). Density and distance of the silhouettes follow the quality level (`kit/quality.js`).
- **Gates**: ring with white and orange wedges, a luminous film and a beam down to the ground (so the height reads). Hit: green and widens; missed: grey and red. Ridges and bridges: low-poly rock with grass on top.
- **Speed**: wind lines around the plane (stronger when pushing above your average or in a sprint), wider field of view, shake on impact.
- **HUD**: three boxes (points, metres, watts ≥ 44 px), hearts, combo, altimeter with the band of watts to ride and a "ring/ridge/bridge in N m" line. Screenshots and measurements: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/planata-shots.mjs [--fps]`.

### Feed Zone (internal id `mattoni`)
`js/games/mattoni.js`; the workout plan is the one of Horde Run (`horde-plan.js`).
- **Idea**: you are the cyclist and the bike is the paddle; the bottle bounces off the soigneurs who scroll past in three rows and delivers the musettes. The goal is always visible: "FEED ZONE 3/4" and "MUSETTE 12/22".
- **Cadence = bottle speed** (8.6 m/s at 85 rpm, from 0.8 to 1.35 times). **Watts in the zone (≥ 92% of the target)** = a turbo that charges (×1…×4 on points); with the turbo half full the next hit is a "SMASH" (flaming bottle). In **rushes** (effort and sprint), while you hold the target the bottle is permanently on fire: it pierces the rows and every delivery counts double.
- **Soigneurs**: normal musettes (1 hit), crates (2 hits), a gel soigneur (a gel drops: turbo +50% and a life). The rows are rigid chains that go back and forth; a delivered one comes back after 4–6 s growing from zero (nothing pops in).
- **Zones**: each wave changes the formation (rows of musettes, gel station, side wind, team car); the 4th and the last end with the **team car** (a mini-boss with a life bar, Meshy model `team_car.glb`) that is beaten with flaming hits. If the block ends first it leaves.
- **Losing the bottle** costs the combo, 50% of the turbo and a life; at zero lives (never in the first minute) there is a "puncture" and you restart with 3 lives. Never a game over. Whoever stops pedalling pauses the game.
- **Stars** as in Horde Run: 1 = finished; 2 = half of the efforts; 3 = 80% of the efforts, all the cars, at most 3 punctures. Records and stars in `localStorage` (`feedBest:<length>:<level>`).
- **Tests**: `tests/feedzone.spec.mjs` (deterministic bot at 0.6/0.8/1.0/1.2 × FTP, distracted bot, pause, screen measurements, controls). The game's random seed comes from `game.seed`.
- Arena and models: Meshy barriers, cheering crowd, cypresses, feed-zone tents, hay bales, finish arch, hills and mountains in the fog; a different time of day for each level (`golden`, `morning`, `dusk`). The Meshy gel model was discarded because its texture has a logo.
- Measurements and screenshots: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/mattoni-shots.mjs [--fps] [--levels]` (screenshots in `docs/giochi-shots/mattoni-*.png`).

### Pedal Strike
3D run-and-gun shooter (`js/games/strike3d.js`, world in `js/games/strike-world.js`, workout shape in `js/games/strike-plan.js`).
- **The game is a workout** (rules in `docs/games/DESIGN-RULES.md`): 5, 10 or 20 minutes chosen in the menu, Easy/Normal/Hard level (−10% / 0 / +10%).
  Easy start 45–60 s at 60% FTP, effort waves (95–110%) and recovery (58%), 10 s sprints at 135% (always followed by 40 s of easy riding),
  a **mini-boss in the middle** and a **final boss** at 105%, 30 s of cool-down with the summary. No adaptive difficulty: targets never change by themselves.
  An effort succeeds if the block average is at least 95% of the target. At the top: time left, workout profile with a "you are here" mark and the results (✓), block card with the watts asked and the power bar.
- **Camera behind the player, three-quarter view**: the cyclist takes about 30% of the height at 390×780, the road and the enemies ahead. The fog is closer and the scenery is prepared 170 m ahead: new objects are born inside the haze.
- **Controls**: + lane to the right, − lane to the left (a single function in play). In the menu − goes to the next row, + changes the row (Start, Length, Level, World, Hero).
  Shooting is automatic; watts in % of FTP set the fire rate; **in the zone** during an effort the shots are full (×1.5, green trail).
- **Different enemies**: foot soldier (fires one announced shot), sniper on the flying saucer (keeps its distance and fires from afar: dodge by changing lane), brute (the lane turns red, then charges), **shielded robot** (yields only above the watts written over its head), drone (bombs on the red circle), swarms of small robots, barriers. Every attack is visible at least 0.6 s ahead.
- **Bosses with phases tied to effort**: a hexagon shield that yields only when you hold the watts asked for 10 s (mini-boss) or 15–20 s (boss), then you fire; below half health "SPRINT: final blow" (overdrive charges faster). Health tuned to FTP: at that power it falls in ~9 s (mini) / ~16 s (boss) of fire. If the block ends first, it retreats (no star, no punishment).
- **Hit streaks** with milestones (×5, ×10, ×20…: points and overdrive), **timed power-ups** dropped by robots (machine gun, fan, rockets, laser 10–12 s; shield 8 s; points ×2 10 s; heart), cages to open (a companion who fires for 30 s).
- **OVERDRIVE** (sprint above 135%): 0.22× slow motion for an instant, white flash, shock wave, wider field of view, every nearby robot blows up in a chain, then 7 s of shots over three lanes, invulnerable.
- **End of the game**: 1–3 stars (★ finished · ★★ at least 60% of the efforts · ★★★ at least 85% and boss down), a record per length, heroes unlocked with stars (Vale at 3, Grandpa Gino at 6). No game over: when the hearts run out you get back up after 2 s. Whoever stops pedalling pauses the game.
- **Demo without a trainer**: 0.8 × FTP, follows the efforts and does the sprints, autopilot.
- Tools: `scripts/strike-bot.mjs` (bot at 4 power levels), `scripts/strike-film.mjs` (frames at 10 per second and strips `docs/giochi-shots/strike-striscia-*.png`), `scripts/strike-shots.mjs [--fps] [--level=0|1|2]` (screenshots and measurements).
