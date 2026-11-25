// Liquid glass: "Reduce transparency". html.solid turns every glass panel into a solid one (css/tokens.css) and switches the ambient background off.
// The choice is stored as reduceGlass = '1' (on) | '0' (off); when nothing is stored it is automatic: on for low-end devices
// (little memory or few cores, no graphics chip, or the game quality detection measured "low", see js/games/kit/quality.js).
// The canvas HUD of the games asks isSolid() to draw its glass without the sheen when panels must be solid.
const KEY = 'reduceGlass';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };

// No graphics chip (the browser draws everything on the CPU: virtual machines, remote desktops, some very old devices):
// blurred glass is far too slow there, so panels are solid unless the person switches glass on.
// Asking costs a WebGL context (a few ms with a GPU, up to half a second without one), so the answer is remembered (glassSoft = '1' | '0'):
// only the very first start waits for it; later starts read the stored answer and check it again once the app is idle.
const SOFT_KEY = 'glassSoft';
let softGl;
function probeRenderer() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return false; // no WebGL: unknown, treated as capable
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch { return false; }
}
function rememberRenderer() { softGl = probeRenderer(); try { localStorage.setItem(SOFT_KEY, softGl ? '1' : '0'); } catch { /* no storage */ } return softGl; }
export function softwareRenderer() {
  if (softGl !== undefined) return softGl;
  const stored = get(SOFT_KEY);
  if (stored === '1' || stored === '0') return (softGl = stored === '1');
  return rememberRenderer();
}

export function lowEndDevice() {
  const mem = navigator.deviceMemory; const cores = navigator.hardwareConcurrency;
  return get('gameQualityAuto') === 'low' || (!!mem && mem <= 2) || (!!cores && cores <= 2) || softwareRenderer();
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

// While something scrolls (a sheet, a menu) the blur of the page behind it is switched off and comes back 160 ms after the last scroll event:
// a blur re-composited on every scrolled frame is the one thing that made scrolling slow on weak GPUs (measured with the software renderer).
let scrollT = 0;
function onScroll() {
  const root = document.documentElement;
  if (!root.classList.contains('scrolling')) root.classList.add('scrolling');
  clearTimeout(scrollT); scrollT = setTimeout(() => root.classList.remove('scrolling'), 160);
}

export function initGlass() {
  apply();
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  for (const q of ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)']) { try { matchMedia(q).addEventListener('change', apply); } catch { /* old WebView */ } }
  window.addEventListener('spindro:quality', apply); // the game quality detection just measured "low"
  syncStill();
  new MutationObserver(syncStill).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  // automatic choice from a remembered answer: ask the browser again when idle (the graphics setup can change) and follow it if it did
  if (isAuto() && get(SOFT_KEY) != null) {
    const recheck = () => { const was = softGl; if (rememberRenderer() !== was) apply(); };
    if (window.requestIdleCallback) requestIdleCallback(recheck, { timeout: 8000 }); else setTimeout(recheck, 4000);
  }
}
