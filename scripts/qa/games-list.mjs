import * as L from './lib.mjs';
const b = await L.launch(); const res = {};
for (const vp of ['s360', 's390', 't768', 'd1280']) for (const lang of ['de', 'fr', 'en', 'it', 'es']) {
  const p = await L.newPage(b, { vp, lang });
  await p.click('#openGame'); await p.waitForTimeout(900);
  await L.shot(p, `gl_${vp}_${lang}`, 'list');
  for (const m of await L.audit(p, 'games')) (res[m.replace(/^\S+ /, '').replace(/\d+/g, '#')] ||= []).push(vp + '/' + lang);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const closed = await p.evaluate(() => document.getElementById('gamePanel').hidden);
  if (!closed) (res['Escape did not close the games list'] ||= []).push(vp + '/' + lang);
  const log = p.qaLog.filter((l) => !/Service Worker/.test(l)); log.forEach((l) => (res[l] ||= []).push(vp + '/' + lang));
  await p.close();
}
await b.close(); for (const [k, v] of Object.entries(res)) console.log(k, '←', v.slice(0, 6).join(','));
