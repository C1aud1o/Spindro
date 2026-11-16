// Round 2: connection flow screens (welcome card, suggestions, dropout banner, devices sheet), audit + screenshots.
import * as L from './lib.mjs';
const b = await L.launch(); const found = {};
const add = (k, v) => v.forEach((m) => (found[m.replace(/^\S+ /, '')] ||= []).push(k));
for (const vp of ['s360', 's390', 't768']) for (const lang of ['de', 'fr', 'en', 'es', 'it']) {
  const tag = `r2_${vp}_${lang}`;
  let p = await L.newPage(b, { vp, lang }); // first run: welcome card
  await L.shot(p, tag, 'welcome'); add(tag + ' welcome', await L.audit(p, 'welcome'));
  await p.evaluate(() => { window.__fakeBle.failNext = true; }); await p.close();
  p = await L.newPage(b, { vp, lang, seed: { mode: 'gears' } });
  await L.connectTrainer(p); await p.waitForTimeout(600);
  await L.shot(p, tag, 'suggest'); add(tag + ' suggest', await L.audit(p, 'suggest'));
  await p.click('#deviceBar'); await p.waitForTimeout(500);
  await L.shot(p, tag, 'devices'); add(tag + ' devices', await L.audit(p, 'devices'));
  await p.keyboard.press('Escape');
  await p.click('#startStop'); await p.waitForTimeout(800);
  await p.evaluate(() => window.__fakeBle.disconnectTrainer()); await p.waitForTimeout(900);
  await L.shot(p, tag, 'dropout'); add(tag + ' dropout', await L.audit(p, 'dropout'));
  const log = p.qaLog.filter((l) => !/Service Worker/.test(l)); if (log.length) add(tag, log.map((l) => 'LOG ' + l));
  await p.close();
}
await b.close();
for (const [m, w] of Object.entries(found)) console.log(m, '\n    ←', w.slice(0, 5).join(', '), w.length > 5 ? `+${w.length - 5}` : '');
