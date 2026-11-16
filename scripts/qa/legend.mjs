// With a Click connected the legend bar floats at the bottom: nothing may stay hidden under it (page and every sheet scrolled to the end).
import * as L from './lib.mjs';
const b = await L.launch(); const out = [];
for (const [vp, lang] of [['s360', 'fr'], ['s360', 'de'], ['s390', 'en'], ['s412', 'it'], ['t768', 'es']]) {
  const p = await L.newPage(b, { vp, lang, seed: { mode: 'gears', rideHistory: Array.from({ length: 5 }, (_, i) => ({ t: Date.now() - i * 864e5, dur: 1800, km: 15, avgW: 150, kj: 270, best: {} })) } });
  await L.connectTrainer(p); await L.connectClick(p); await p.waitForTimeout(600);
  const probe = (label) => p.evaluate((label) => {
    const lg = document.querySelector('.click-bar'); if (!lg || !lg.getClientRects().length) return `${label}: no legend visible`;
    const top = lg.getBoundingClientRect().top;
    const layers = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body')]; const root = layers.length ? layers[layers.length - 1] : document.scrollingElement;
    root.scrollTop = root.scrollHeight;
    const els = [...(layers.length ? root : document.body).querySelectorAll('button, a, input, select, p, h2, h3, li, dd, summary, label')].filter((e) => e.offsetParent && !lg.contains(e));
    const last = els.reduce((a, e) => (e.getBoundingClientRect().bottom > a.b ? { b: e.getBoundingClientRect().bottom, e } : a), { b: 0, e: null });
    return `${label}: legend top ${Math.round(top)}, lowest content bottom ${Math.round(last.b)} (${last.e?.tagName}.${(last.e?.className || '').toString().slice(0, 20)}) → ${last.b <= top + 1 ? 'OK' : 'HIDDEN UNDER LEGEND by ' + Math.round(last.b - top) + 'px'}`;
  }, label);
  out.push(`${vp}/${lang} ` + await probe('home'));
  for (const [name, open] of [['settings', '#openSettings'], ['history', '#openHistoryCard'], ['workouts', '#openWorkouts']]) {
    await p.click(open).catch(() => {}); await p.waitForTimeout(500); out.push(`${vp}/${lang} ` + await probe(name)); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }
  await p.close();
}
await b.close(); console.log(out.join('\n'));
