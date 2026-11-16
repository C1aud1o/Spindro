// Each game's menu (and the games list) at 360×640 in all five languages: screenshots for review.
import * as L from './lib.mjs';
const b = await L.launch();
const only = process.argv[2] ? process.argv[2].split(',') : ['racer', 'horde', 'gruppetto', 'planata', 'mattoni', 'shooter', 'video'];
for (const lang of ['de', 'fr', 'es', 'it', 'en']) {
  const p = await L.newPage(b, { vp: 's360', lang });
  await p.click('#openGame'); await p.waitForTimeout(800); await L.shot(p, 'gm', lang, 'list');
  const list = await L.audit(p, 'games-list'); if (list.length) console.log(lang, 'list', list.filter((x) => !/ellips/.test(x)));
  await p.close();
  for (const id of only) {
    const q = await L.newPage(b, { vp: 's360', lang, path: `/index.html?game=${id}` });
    await q.waitForFunction(() => ['menu', 'play'].includes(window.__game?.state) || document.querySelector('.video-pick'), null, { timeout: 90000 }).catch(() => {});
    await q.waitForTimeout(1500); await L.shot(q, 'gm', lang, id);
    const bar = await q.evaluate(() => { const h = document.getElementById('gameHelp'); return h ? [h.scrollHeight > h.clientHeight + 1, h.textContent.length] : null; });
    console.log(lang, id, 'help clipped:', bar?.[0]);
    await q.close();
  }
}
await b.close();
