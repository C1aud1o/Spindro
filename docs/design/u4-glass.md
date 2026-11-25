# U4 · Liquid glass

The whole app (home, ride dashboard, sheets, dialogs, menus, toasts, Click menu, game menu, the shared game HUD and workout strip, the mini window and the extension popup) is restyled in a "liquid glass" look: translucent layered panels over a calm ambient background, soft specular edges and inner light, generous radii, floating pills and bars, springy motion. The identity stays: dark base, lime `#D9FF3D` as the only accent, off-white `#F2F0E6` text, Barlow / Barlow Condensed. Icons are the same flat line icons. Original work: no vendor assets or components.

Contact sheets (before / after, rendered from the real code): `u4-glass-app.png`, `u4-glass-games.png`, `u4-glass-a11y.png`, `u4-glass-mini.png`. Numbers: `u4-perf.json`, `u4-contrast.md`.

## Where things live

| file | what |
|---|---|
| `css/tokens.css` | **the only place** for colour, glass (tint, blur, saturation, edge light), radius scale, elevation, motion and focus tokens; the solid, high-contrast and no-`backdrop-filter` variants |
| `css/glass.css` | the surface recipes built from the tokens: ambient background, flat glass, controls, floating glass, game parts, focus ring |
| `css/style.css` | layout and type only; the surface declarations the glass layer replaced were removed |
| `css/mini.css` | the mini window (it `@import`s `tokens.css`) |
| `extension/popup/popup.css` | the popup carries its own small copy of the tokens (separate package) |
| `js/glass.js` | "Reduce transparency": `html.solid`, automatic on low-end devices, `html.still` pauses the ambient drift |
| `js/games/kit/hud.js` | `panel()` draws the canvas HUD glass (inner light + specular hairline, no blur) |

## Two kinds of glass (on purpose)

`backdrop-filter` is expensive, so:

* **flat glass** (cards, groups, buttons, fields, the canvas HUD): tint + inner light + specular edge, **no blur**. Any number of them.
* **floating glass with blur**: only the layers that sit over moving content and do not scroll themselves: the header pill, the ride bar, toasts, the update bar, the Click legend bar. A handful at most.
* **floating and scrolling** (sheets, the Click menu box, dialogs): a dense flat tint, **no blur**. Measured with the software renderer, a blur behind scrolling content cost about 1000 ms of CPU per second.
* Never blur over a running game's WebGL canvas (`body.game-open` switches even the toast and bars to the flat tint), never animate the blur radius.
* `@supports not (backdrop-filter)`: the floating fill becomes almost opaque.

## Ambient background

`html::before`: four slow low-contrast colour fields (lime, violet, teal, violet) over the dark base, a single composited layer that drifts over 90 s. It pauses (`html.still`) while riding, in a game, in a sheet; there is no motion at all with `prefers-reduced-motion`, and no ambient at all in solid mode.

## Reduce transparency / contrast

Three routes to solid panels, all through the same token block:

1. **Settings → Reduce transparency** (all five locales). Stored as `reduceGlass` (`1` / `0`); when never touched it is automatic: on for devices with ≤ 2 GB of memory or ≤ 2 cores, or when the game quality detection measured "low" (`gameQualityAuto`, see `js/games/kit/quality.js`). The switch always shows the effective state.
2. `prefers-reduced-transparency: reduce`.
3. `prefers-contrast: more`: solid panels, firm 1 px borders, brighter secondary text.

The canvas HUD drops its sheen in solid mode (`isSolid()`), the mini window follows the `.solid` class of the app page.

## Accessibility

* Text contrast is measured against the **worst pixel behind each text** (ambient and glass included): see `u4-contrast.md` (`node scripts/u4-contrast.mjs`). AA everywhere in glass, solid and high-contrast mode.
* Focus: 2 px lime outline plus a soft halo on every `:focus-visible`; targets ≥ 44 px (the mini-window button was 36 px).
* `tests/a11y.spec.mjs` (axe) stays green.

## Compatibility

Android WebView (min SDK 23): only the features the app already used. `backdrop-filter` has a fallback (above); `:has()` is used only for the desktop-Chromium mini-window button spacing and degrades to a harmless overlap-free default elsewhere.

## Regenerating the sheets

```sh
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/u4-shots.mjs --base=http://127.0.0.1:4173 --out=/tmp/u4-after
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/u4-mini-shots.mjs --base=http://127.0.0.1:4173 --out=/tmp/u4-mini-after
python3 scripts/u4-sheets.py /tmp/u4-before /tmp/u4-after /tmp/u4-mini-before /tmp/u4-mini-after
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/glass-perf.mjs --runs=3 --sec=8     # frame times
```

The "before" directories come from the same scripts run on a checkout of the commit before this work (`git worktree add`).
