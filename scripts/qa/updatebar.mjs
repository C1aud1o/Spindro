// The "new version ready · Reload" bar in every language at 360 px: no overflow, button ≥ 44 px, not covering anything.
import * as L from './lib.mjs';
const b = await L.launch();
for (const lang of ['it', 'en', 'de', 'fr', 'es']) {
  const p = await L.newPage(b, { vp: 's360', lang, seed: { rideHistory: [{ t: Date.now() - 864e5, dur: 1800, km: 15, avgW: 150, kj: 270, best: {} }] } });
  await p.evaluate(async () => { const { t } = await import('./js/i18n.js'); const bar = document.createElement('div'); bar.className = 'update-bar'; bar.setAttribute('role', 'status'); const m = document.createElement('span'); m.textContent = t('update.ready'); const bt = document.createElement('button'); bt.className = 'ghost'; bt.textContent = t('update.reload'); bar.append(m, bt); document.querySelector('main').prepend(bar); });
  await p.waitForTimeout(300); await L.shot(p, 'upd', lang);
  console.log(lang, await p.evaluate(() => { const r = document.querySelector('.update-bar').getBoundingClientRect(); const bt = document.querySelector('.update-bar button').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), btn: [Math.round(bt.width), Math.round(bt.height)], overflow: document.documentElement.scrollWidth > innerWidth }; }));
  await p.close();
}
await b.close();
