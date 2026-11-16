// Clicks every visible button/link/label on each screen and reports: JS errors, unhandled rejections, and clicks that change nothing.
import * as L from './lib.mjs';
const DAY = 864e5;
const rides = Array.from({ length: 6 }, (_, i) => ({ t: Date.now() - (6 - i) * 2 * DAY, dur: 1800, km: 15, avgW: 150, kj: 270, np: 170, maxW: 400, best: { 5: 520, 60: 300, 300: 240, 1200: 200 }, series: Array.from({ length: 100 }, (_, k) => 150 + (k % 30)) }));
const screens = {
  home: { seed: { rideHistory: rides }, open: async () => {} },
  'home+trainer': { seed: { rideHistory: rides, mode: 'gears' }, open: async (p) => { await L.connectTrainer(p); } },
  settings: { open: async (p) => { await p.click('#openSettings'); } },
  modes: { open: async (p) => { await p.click('#moreModes'); } },
  workouts: { seed: { plan: { id: 'piuftp', start: Math.round(Date.now() / DAY) - 3, done: {}, skipped: {}, moved: {} } }, open: async (p) => { await p.click('#openWorkouts'); } },
  plans: { open: async (p) => { await p.click('#openWorkouts'); await p.click('#tabPlans'); } },
  history: { seed: { rideHistory: rides }, open: async (p) => { await p.click('#openHistoryCard'); } },
  devices: { open: async (p) => { await p.click('#deviceBar'); } },
  finish: { open: async (p) => { await L.connectTrainer(p); await p.click('#startStop'); await p.waitForTimeout(2300); await p.click('#finishRide'); } },
  ride: { seed: { mode: 'gears' }, open: async (p) => { await L.connectTrainer(p); await p.click('#startStop'); await p.waitForTimeout(500); } },
};
const SKIP = /^(wipeData|backupIn|gpxFile|zwoFile)$/;
const b = await L.launch(); const report = [];
const snap = (p) => p.evaluate(() => JSON.stringify([document.body.innerText.length, document.body.className, [...document.querySelectorAll('.sheet')].map((s) => s.hidden), document.querySelectorAll('.dlg').length, document.getElementById('toast').className + document.getElementById('toast').textContent, Object.entries(localStorage).map(([k, v]) => k + v.length).sort().join(), document.getElementById('gamePanel').hidden, location.href, [...document.querySelectorAll('[aria-pressed],[aria-expanded],.on,[open]')].length, document.activeElement?.id]));
for (const [name, def] of Object.entries(screens)) {
  const probe = await L.newPage(b, { vp: 's390', lang: 'en', seed: def.seed || {} });
  await def.open(probe); await probe.waitForTimeout(500);
  const targets = await probe.evaluate(() => {
    const layers = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body, .calib')]; const root = layers.length ? layers[layers.length - 1] : document.body;
    return [...root.querySelectorAll('button, a[href], label.file-btn, summary, [role=button]')].filter((e) => e.offsetParent !== null && !e.disabled).map((e, i) => ({ i, id: e.id, txt: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 28), sel: e.id ? '#' + e.id : null }));
  });
  await probe.context().close();
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]; if (SKIP.test(t.id)) continue;
    const p = await L.newPage(b, { vp: 's390', lang: 'en', seed: def.seed || {} });
    try {
      await def.open(p); await p.waitForTimeout(400);
      const els = await p.evaluateHandle(() => { const layers = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body, .calib')]; const root = layers.length ? layers[layers.length - 1] : document.body; return [...root.querySelectorAll('button, a[href], label.file-btn, summary, [role=button]')].filter((e) => e.offsetParent !== null && !e.disabled); });
      const h = (await els.getProperties()).get(String(k)); const el = h.asElement(); if (!el) { await p.context().close(); continue; }
      const before = await snap(p);
      const href = await el.evaluate((e) => e.tagName === 'A' ? e.getAttribute('href') : null);
      if (href && /^https?:/.test(href)) { await p.context().close(); continue; } // external links
      p.qaLog.length = 0;
      await p.evaluate(() => { window.__rej = []; window.addEventListener('unhandledrejection', (e) => window.__rej.push(String(e.reason?.message || e.reason))); });
      await el.click({ timeout: 3000, force: false }).catch((e) => report.push(`[${name}] "${t.txt}" ${t.id}: NOT CLICKABLE (${e.message.split('\n')[0].slice(0, 80)})`));
      await p.waitForTimeout(450);
      const after = await snap(p); const rej = await p.evaluate(() => window.__rej || []);
      const errs = [...p.qaLog.filter((l) => !/Service Worker|Failed to load resource.*(youtube|strava|goatcounter)/.test(l)), ...rej.map((r) => 'rejection ' + r)];
      if (errs.length) report.push(`[${name}] "${t.txt}" ${t.id}: ERRORS ${errs.join(' | ').slice(0, 200)}`);
      else if (before === after) report.push(`[${name}] "${t.txt}" ${t.id}: no visible effect`);
    } catch (e) { report.push(`[${name}] "${t.txt}" ${t.id}: script error ${e.message.split('\n')[0].slice(0, 100)}`); }
    await p.context().close();
  }
}
await b.close(); console.log(report.join('\n') || 'nothing to report');
