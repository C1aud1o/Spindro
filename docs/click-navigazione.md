# Navigating Spindro with Zwift controllers

Goal: with a Zwift controller connected you can do **everything without touching the phone**, and you can always
**see what the app receives** (the key check) and **what the keys do right now** (the legend bar).

> Nothing here has been tried on real hardware except that the **+** (bit 12) and **−** (bit 8) keys of the Click v2
> reach the app. Everything else was tested only with the fake device (`tests/fake-ble.js`). See "What is verified" below.

## Roles, not raw ids
The driver (`js/click.js`) turns every raw id (`v1:1`, `ride:12`, `play:2`, `zr:9`) into a **role**; the rest of the app
only knows roles:

| Role | Meaning | Default raw ids |
|---|---|---|
| `plus` / `minus` | shift up / down (riding), next / previous or change a value (menus) | `v1:1` `v1:2` · `ride:12` `ride:8` · shift paddles `ride:9/10/13/14`, `zr:9/10/13/14` · Ride A/B/Y/Z `zr:4/5/6/7` |
| `up` `down` `left` `right` | arrow pad | Click v2 `ride:1/3/0/2` · Play `play:2/5/3/4` · Ride `zr:1/3/0/2` |
| `ok` / `back` | A = choose, B = back | Click v2 `ride:4` / `ride:5` (Ride: none by default, A/B still shift) |
| `menu` | opens the Click menu | Play `play:6`, Ride `zr:12` `zr:17` (and anything you map to it, e.g. Y / Z) |

Events from the driver: `press` / `release` (`{ id, role, kind }`, also for keys without a role), `shift` (±1, built from
roles), `hold` (held direction, for steering in games), `combo` (+ and − together, or the `menu` key), `unknown`, `kind`,
`rolechange`. Shifting uses `plus` / `minus` and, as before, the arrows (up/right = +, down/left = −) and the shift paddles.

The role table can be changed from the **key check** (below) or from the debug page (“Use as +/−/no action” sits on top of
roles). It is stored in `localStorage` as `clickRoles` (per device family `v1`, `ride` = Click v2, `play`, `zr` = Ride,
with a `confirmed` flag). The old `clickMap` is migrated once (only entries that differed from the old defaults).

Which model is connected is only known from the **first message** it sends (`0x37` = Click v1, `0x23` = Click v2 / Ride,
`0x07` = Play). Until then a Click is treated as a two-key controller.

## One navigation model (`js/clicknav.js`)

| Situation | Two-key (Click v1) | With arrows (Click v2, Ride, Play) |
|---|---|---|
| **Menus, sheets, dialogs** | `+` / `−` move; hold `+` = choose; hold `−` = back | arrows move **spatially** (nearest element in that direction by bounding boxes, wrapping at the edges); `A` chooses at once; `B` goes back at once; `+` / `−` change the value of a focused slider / number / list, otherwise move next / previous; hold `+` / hold `−` still choose / go back |
| **Number or list focused** | hold `+` “grabs” it, `+` / `−` change it, hold `+`/`−` to finish | `+` / `−` change it on the spot (up / right = more, down / left = less once grabbed with `A`) |
| **Riding** (a ride or workout is running, no game) | `+` / `−` shift gear or ERG target; hold `−` 0.8 s opens the Click menu | same, plus `A` opens the Click menu; `B` closes it |
| **In a game** | `+` / `−` go to the game; hold `−` 0.8 s opens the Click menu | `+` / `−` and left / right go to the game; hold `B` 0.8 s opens the Click menu |

- Play has no `+` / `−` and no A / B role by default: the arrows move, **hold ▶ = choose, hold ◀ = back**, the Zwift button = menu.
- Navigation switches on by itself when a controller is connected and nothing is running (`sync()`, every 150 ms and at each key).
  Keys already held when it switches on (e.g. the long “−” that opened the menu) are ignored until released.
- **Focus style**: thick lime ring + slight scale (`.cn-focus`), amber while a value is grabbed. The focused element is scrolled
  into view with margins (`scroll-margin` in `css/style.css`) so it never sits under the sticky bottom bar or the legend.
- **Long-press fill**: while a long press is running, the focused element fills from left to right (lime for “choose”, amber for
  “back”); on the riding / game screen the legend bar fills instead.
- **Legend bar** (`.click-bar`, always at the bottom while a controller is connected): small key icons plus words in the user's
  language, for the context in use: menus (`▲▼◀▶ move · A choose · B back` or `+ − move · hold + choose · hold − back`), a grabbed
  value, riding (`+ − shift · hold − menu` / `A menu`) and games (`+ − play · hold − menu` / `hold B menu`). It follows the
  connected model and the learned roles, and disappears when no controller is connected or the key check is open.
- **Click menu** (riding, or a menu key): pause / start, end workout, finish, devices, workouts, games, video, history, settings,
  **Check your controller**, back to home, close. In a game: resume, exit game, home, audio, **Check your controller**.
- Scope (`scope()`): Click menu > `.calib` dialogs > `.sheet` panels > debug > games > home. Reachable elements are the visible
  controls of that scope. Confirmations use `js/dialog.js` (`ask()`), so they are reachable too.

## Keyboard (PC and tests)
Same roles: arrows = `up/down/left/right`, `Enter` = `ok`, `Escape` = `back`, `+` / `-` = `plus` / `minus`, `M` toggles the Click
menu. With no navigation active (no controller, nothing open) the arrows shift gear as before.

## Key check (`js/clickcheck.js`) — “Check your controller”
Opens by itself the **first time each model connects** (`clickCheckSeen` in `localStorage`; never while riding), and any time from
**Devices → Check your controller** and from the **Click menu**. While it is open the controller keys do not navigate or shift.

1. **Live feedback.** A simple inline-SVG drawing of the connected model (Click v1: one round pod with + and −; Click v2: two pods,
   arrows and − on the left, A/B/Y/Z and + on the right; Play: two controllers; Ride: like v2 plus the menu key). Whichever key is
   pressed lights up, its name is shown large and the **raw id** (`ride:12`) small. A key that has no role and no known name lights
   the **?** slot. The drawing is lit by the *role* the app has for the id, so after mapping it matches what you press.
2. **Guided mapping** (“Map my keys”): “Press +”, “Press −”, then for models with more keys Up, Down, Left, Right, A, B and the
   optional Y, Z (Y / Z become the `menu` role). Play: the four arrows and the menu key. Click v1: only + and −. The raw id received
   becomes that role; a key already used in the same run is refused; every step can be skipped by touch; keys never mapped keep the
   defaults. “Reset to defaults” clears the learned roles of the connected family.
3. After the last step the sheet says **“Mapping confirmed by you”** (and the flag is stored); otherwise it says the mapping is the
   default one and not yet confirmed.
4. **Copy report**: model, protocol message types seen (e.g. `0x23`), confirmed or not, the role → raw id table (learned ids
   marked), unknown ids seen, app build. No device id, name or other personal data. The text is also shown under “Report text”.

How to run it: connect the controller (Devices → Add device); the sheet opens → press every key and watch the drawing →
“Map my keys” → follow the prompts → “Copy report” and paste it to the developers.

## What is verified
- Verified on a real Van Rysel D100 “Zwift Ready” with its Click v2: **+ = bit 12 and − = bit 8** of the `0x23` bitmask.
- **Not verified** (names come from an open-source table, see `docs/zwift-controller.md`): arrows = bits 0–3 (0 left, 1 up, 2 right,
  3 down), A = bit 4, B = bit 5, Y = bit 6, Z = bit 7, the shift paddles and the Zwift menu keys of the Ride, every Play field,
  and whether a Click is v1 or v2 before it sends its first message. The key check exists to find out.
- The long-press lengths (0.65 s choose / back, 0.8 s menu) and the spatial navigation feel have not been tried on a real controller.

## Tests
`tests/click-nav.spec.mjs` (two-key Click v1: `clickProto = 'v1'`), `tests/click-roles.spec.mjs` (arrows, spatial navigation by element
positions, legend per context and model, key check, learned mapping, report), `tests/controllers/zwift-controllers.test.cjs`
(protocols, gear, menu). Fake device: `tests/fake-ble.js` (`press`, `hold`, `pressBit`, `pressId('ride:12')`, `pressNums`,
`clickModel` = `click | play | ride`, `clickProto` = `ride | v1 | play | zr`). The fake marks the key check as already seen
(`clickCheckSeen`); tests of the automatic opening clear it.

## Remote mode (X1)
With the optional browser extension (`extension/`, [docs/extension.md](extension.md)) the Click can drive another tab (YouTube, Netflix…) while Spindro
keeps running in the mini window. **Remote** is a mode toggled from the Click menu ("Remote mode: control the other tab"), the key `r`, or the mini
window; it is only offered once the extension has answered the handshake (`js/remote.js`, protocol v1); otherwise an explanation with a link to the guide.

| Role | In Remote mode |
|---|---|
| `plus` / `minus` (two-key Click) | short press: seek +10 s / −10 s; **hold `−`** (0.8 s) still opens the Click menu (the seek fires on release only if it was short) |
| `up` / `down` | volume up / down |
| `left` / `right` | seek −10 s / +10 s |
| `ok` | play / pause |
| `back` | browser back |
| `menu` (or `+` and `−` together) | Click menu |

In Remote mode `clicknav` does not navigate Spindro unless the menu is open (`remote()` option), so nothing moves on the Spindro page behind the video.
The shift / hold handlers of the Spindro mode are skipped, so the workout intensity (ERG bias) does not change by accident; it stays reachable from the
Click menu ("Harder (+)" / "Easier (−)") and from the mini window. The menu gets a **Remote: other tab** section listing every command (so the rider
with only `+` and `−` can reach all of them). Keyboard: arrows, Enter, Esc, `+` / `−` send the same commands while Remote is on; `p` toggles the mini
window; `m` opens the Click menu. Tests: `tests/remote.spec.mjs` (fake extension), `tests/ext/` (real extension).

## Devices panel (H1)
The status row on the home (`#deviceBar`) opens the **Devices** panel: connected devices (role, battery, Disconnect), one “Add device”
(`#addDevice`, one Bluetooth chooser with all supported services), the power and cadence sources (`#srcPower`, `#srcCadence`) and, when a
Zwift controller is connected, “Check your controller”. Roles are assigned by `js/devices.js` from the services; only Cycling Power asks
“trainer or power meter?” once and remembers it (`devRoles`). Sources: `js/sources.js`. Reconnection at start-up: `devKnown` +
`navigator.bluetooth.getDevices()`. Tests: `tests/devices.spec.mjs`.
