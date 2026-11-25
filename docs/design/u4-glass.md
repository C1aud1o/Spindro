# U4 + U5 · Liquid glass

> **U5 (second, bold pass)** is described first; the U4 text below it still applies where it is not overridden. Side-by-side of the flat original, the first pass and U5: `u5-compare.png`.

## U5: what changed and why

The first pass (U4) was technically sound but too timid: dark panels over an almost black page, a faint glow. Glass only reads as glass if there is something to see *through* it, so U5 changes the world behind the panels and the optics of the panels, on the same token system.

1. **A real background to refract** (`--ambient`, `--ambient-orbs`): big saturated fields (teal top-left and bottom-left, violet right, a warm hint at the bottom, a little lime top-right), plus three soft-edged discs that drift the other way (an edge to refract), under a vignette that darkens towards the edges. Two layers (`html::before/::after`), compositor-only transforms, 70 s / 91 s drift, paused (`html.still`) while riding, in a game or in a sheet. On the ride dashboard `body.riding::before` adds a field of the current power-zone colour (`--zone`, existing zone colours) at 16 % opacity; the colour moves over 2.5 s, it never flashes.
2. **Obviously translucent panels**: tint down from .48 to .42 (flat), .46 (floating, blurred); blur 26 px with 190 % saturation on the floating layers; a specular rim built from inset shadows (`--edge-shadow`: bright 1.5 px top-left, hairline all round, a faint return bottom-right); a diagonal gloss (`--sheen`, 158°); radii 26-28 px for cards, pills for every button; a soft outer shadow.
3. **Controls as glass**: every button, stepper, icon button, chip and the mini-window button is a pill of thick glass with a gloss; the primary action (`--cta-fill`) is luminous tinted lime glass (translucent lime, bright rim, inner glow) instead of a flat block; the pressed state scales to .93-.95 with a spring easing and the light moves to the opposite corner (`--sheen-press`); segmented controls are sunken pill wells with a glass thumb; toggles, fields and tiles share the same rim.
4. **Floating layers**: header pill (blur), ride bar docked at the bottom on the phone and centred (640 px) on desktop (blur), toasts and bars (blur), dialogs (blur, they do not scroll), sheets and the Click menu (translucent .80 tint; the *page behind them* is blurred with a plain `filter` on `<header>` and `<main>`, see below).
5. **Numbers**: hierarchy unchanged. The strongest tint (.72) sits behind the big numbers; secondary text went from .64 to .76 opacity.
6. **Mini window and popup**: same tokens (the popup carries its own copy), no blur. The canvas HUD (`js/games/kit/hud.js` `panel()`) and the workout strip keep tinted glass **without** blur but with the same gloss and a gradient rim (bright top-left, fading), same radius family.
7. **No outlines (owner's feedback, third pass)**: glass has no drawn border. The hairline around every panel (`--edge`) and the lime rings (`--accent-line`) are transparent with glass; the edge is only light: a soft highlight on the top rim, a fainter one at the bottom, a little glow inside (`--hi`, `--hi-strong`, `--lo`). Fields and tracks are wells, not glass, and keep a hairline (`--field-line`). In the games the outlined buttons and panels became tinted glass (`panel()` takes `tint`, no `border`). The Click focus ring stays: it is a focus indicator, not decoration.
8. **Solid panels are cheap on purpose**: no blurred shadows at all (every soft shadow is a token flattened to nothing), faint 1 px rings, short plain motion, no ambient layers before the app is ready. Without a GPU each blurred shadow was paid again on every repaint: 25 ms per frame during a ride against 8 ms before the restyle, back to under 8 ms now.
9. **Readability first (owner's feedback, fourth pass)**: the background has two colour fields only (teal from the top-left, violet from the bottom-right) and no drifting discs; the glass is a neutral grey (`--glass-tint`), denser than before, with a deeper grey where there is a lot of text or the big numbers (`--glass-tint-deep`: sheets, menus, the power panel); the gloss is softer and the secondary text brighter (`--t2` .9, `--t3` .84). Lowest measured contrast over all screens: 6.6:1 (it was 5.05), see `docs/design/u4-contrast.md`.

### Why the sheet backdrop is a `filter` on the page, not a `backdrop-filter`

Measured with the software renderer while scrolling the long Settings sheet: a `backdrop-filter` on the sheet, on its scrim or on a sibling layer under it costs about +900 ms CPU per second and drops frames to 50 fps (Chromium re-evaluates it for every scrolled frame). A plain `filter: blur()` on `<main>` is no better when it is on *while* the sheet scrolls. So: sheets, menus and dialogs blur the page behind them with `html:not(.scrolling) body:has(.sheet:not([hidden]), …) > :is(header, main) { filter: var(--page-blur) }`, and `js/glass.js` sets `html.scrolling` from capture-phase `scroll` events, which switches that blur off until 160 ms after the last scroll event. The blur radius is never animated, the sheet itself never has a blur, nothing is blurred over a game. Where `:has()` is not available (old WebView) the page is simply not blurred behind a sheet (the dim scrim stays).

### Perf and contrast (U5)

* Frame times: `u4-perf.json` → `u5`. Game (Horde Run, quality low, SwiftShader): +0.4 % and +0.8 % against the flat original in two alternating rounds (limit 10 %). Dashboard 16.67 ms (vsync). Scrolling the Settings sheet holds 60 fps but uses more CPU than the flat original (≈ 1.5 s vs 0.5 s per second in the software renderer).
* Contrast: `u4-contrast.md` (`node scripts/u4-contrast.mjs`). Now also measured at the far end of the ambient drift, with the Click menu and the confirm dialog added, and only the visible part of scrolled text sampled. Glass (both drift ends), solid and high contrast: no text below AA.

---

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
* **floating and scrolling** (sheets, the Click menu box): a translucent flat tint, **no blur on the element itself** (U5: the page behind is blurred with a plain filter, switched off while scrolling, see above). Dialogs do not scroll and do blur.
* Never blur over a running game's WebGL canvas (`body.game-open` switches even the toast and bars to the flat tint), never animate the blur radius.
* `@supports not (backdrop-filter)`: the floating fill becomes almost opaque.

## Ambient background

`html::before`: (U4 text; U5 replaced it, see the top of this file.) It pauses (`html.still`) while riding, in a game, in a sheet; there is no motion at all with `prefers-reduced-motion`, and no ambient at all in solid mode.

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
python3 scripts/u4-sheets.py /tmp/u4-before /tmp/u4-after /tmp/u4-mini-before /tmp/u4-mini-after docs/design /tmp/u4-firstpass   # last one: shots of the first pass, for u5-compare.png
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/glass-perf.mjs --runs=3 --sec=8     # frame times
```

The "before" directories come from the same scripts run on a checkout of the commit before this work (`git worktree add`).
