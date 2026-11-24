// Liquid glass: "Reduce transparency". html.solid turns every glass panel into a solid one (css/tokens.css) and switches the ambient background off.
// The choice is stored as reduceGlass = '1' (on) | '0' (off); when nothing is stored it is automatic: on for low-end devices
// (little memory or few cores, or the game quality detection measured "low", see js/games/kit/quality.js).
// The canvas HUD of the games asks isSolid() to draw its glass without the sheen when panels must be solid.
const KEY = 'reduceGlass';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };

export function lowEndDevice() {
  const mem = navigator.deviceMemory; const cores = navigator.hardwareConcurrency;
  return get('gameQualityAuto') === 'low' || (!!mem && mem <= 2) || (!!cores && cores <= 2);
}
/** What the switch shows: the stored choice, else automatic. */
export function reduceChoice() { const v = get(KEY); return v === '1' ? true : v === '0' ? false : lowEndDevice(); }
export const isAuto = () => get(KEY) == null;

let solid = false;
/** Solid panels right now: the switch (or automatic) or the system asking for less transparency / more contrast. */
export const isSolid = () => solid;

export function apply() {
  const sw = reduceChoice();
  solid = sw || mq('(prefers-reduced-transparency: reduce)') || mq('(prefers-contrast: more)');
  const root = document.documentElement;
  root.classList.toggle('solid', sw);
  window.dispatchEvent(new CustomEvent('spindro:glass', { detail: { solid, auto: isAuto() } }));
}
export function setReduce(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* no storage */ } apply(); }

// the ambient background drifts only while nothing blurred or animated is on top of it: not while riding, in a game, or with a sheet open
function syncStill() {
  const b = document.body;
  const busy = b.classList.contains('riding') || b.classList.contains('game-open') || b.classList.contains('debug-open') || b.style.overflow === 'hidden';
  document.documentElement.classList.toggle('still', busy);
}

export function initGlass() {
  apply();
  for (const q of ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)']) { try { matchMedia(q).addEventListener('change', apply); } catch { /* old WebView */ } }
  window.addEventListener('spindro:quality', apply); // the game quality detection just measured "low"
  syncStill();
  new MutationObserver(syncStill).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
}
