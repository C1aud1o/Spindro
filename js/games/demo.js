// DEMO RIDER for game development: open  index.html?game=<id>&demo=1  and the game starts straight away, driven by a
// simulated rider instead of a trainer. A small panel (bottom of the screen) sets power and cadence; + / − are buttons.
//
//   keys   W / S  power ±10 W     R / F  cadence ±5 rpm     H  hide / show the panel     A / D or ← / →  − / +  (the app's own keys)
//   page   window.__demo = { power, cadence, ftp, set({ power, cadence, ftp }) }  (the bot harness `npm run game:check` drives it)
//
// Only loaded when the URL has demo=1; it patches the hooks the app gives to games (docs/games/API.md) and nothing else.

/** @param {import('./kit/types.js').GameHooks} hooks  the app's hooks object: patched in place */
export function installDemo(hooks, { onInput = () => {}, host = document.body } = {}) {
  const d = { power: 160, cadence: 85, ftp: Number(localStorage.getItem('ftp')) || 200, gear: 12 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  d.set = (o = {}) => { for (const k of ['power', 'cadence', 'ftp']) if (Number.isFinite(o[k])) d[k] = o[k]; paint(); };
  Object.assign(hooks, {
    connected: () => true,
    ftp: () => d.ftp,
    stats: () => ({ power: Math.round(d.power), cadence: Math.round(d.cadence), gear: d.gear, heartRate: Math.round(70 + 100 * clamp(d.power / (1.2 * d.ftp), 0, 1)) }),
    speedKmh: () => clamp(d.cadence * 0.33 * (0.5 + d.gear / 24), 0, 70),
    shift: (dir) => { d.gear = clamp(d.gear + dir, 1, 24); d.power = clamp(Math.round(d.power * (dir > 0 ? 1.06 : 0.94)), 0, 1500); paint(); },
  });
  const box = document.createElement('div');
  box.id = 'demoRider';
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:4px 10px;background:rgba(10,10,16,.62);color:#fff;font:600 11px system-ui,sans-serif;display:grid;gap:2px;grid-template-columns:auto 1fr auto;align-items:center';
  box.innerHTML = `<span>power</span><input id="demoPower" type="range" min="0" max="600" step="5"><b id="demoPowerV"></b>
    <span>cadence</span><input id="demoCadence" type="range" min="0" max="140" step="1"><b id="demoCadenceV"></b>
    <button id="demoMinus" style="font-size:15px;padding:0 16px">−</button><span style="text-align:center">demo rider · W/S R/F A/D · H hides</span><button id="demoPlus" style="font-size:15px;padding:0 16px">+</button>`;
  host.append(box);
  const $ = (id) => box.querySelector(`#${id}`);
  function paint() { $('demoPower').value = d.power; $('demoCadence').value = d.cadence; $('demoPowerV').textContent = `${Math.round(d.power)} W (${Math.round((100 * d.power) / d.ftp)} %)`; $('demoCadenceV').textContent = `${Math.round(d.cadence)} rpm`; }
  $('demoPower').addEventListener('input', (e) => d.set({ power: +e.target.value }));
  $('demoCadence').addEventListener('input', (e) => d.set({ cadence: +e.target.value }));
  const press = (dir) => { onInput(dir); setTimeout(() => onInput(0), 120); };
  $('demoMinus').addEventListener('click', () => press(-1));
  $('demoPlus').addEventListener('click', () => press(+1));
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'h') box.hidden = !box.hidden;
    if (k === 'w') d.set({ power: clamp(d.power + 10, 0, 600) }); else if (k === 's') d.set({ power: clamp(d.power - 10, 0, 600) });
    else if (k === 'r') d.set({ cadence: clamp(d.cadence + 5, 0, 140) }); else if (k === 'f') d.set({ cadence: clamp(d.cadence - 5, 0, 140) });
  });
  paint();
  window.__demo = d;
  return d;
}
