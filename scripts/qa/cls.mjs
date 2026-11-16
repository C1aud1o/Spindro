// Layout shift (CLS) and flash of untranslated/unstyled content on load. Usage: node scripts/qa/cls.mjs
import * as L from './lib.mjs';
const b = await L.launch();
for (const [vp, lang] of [['s390', 'en'], ['s390', 'de'], ['s360', 'fr'], ['d1280', 'it']]) {
  const [width, height] = L.VIEWPORTS[vp];
  const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await ctx.route('**/locales/*.json', async (r) => { await new Promise((s) => setTimeout(s, 250)); r.continue(); }); // a slowish network
  await page.addInitScript((lang) => {
    localStorage.setItem('safetyAck', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', lang);
    window.__cls = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: e.sources?.map((s) => s.node?.id || s.node?.className || s.node?.nodeName).slice(0, 3) }); }).observe({ type: 'layout-shift', buffered: true });
    // first paint with empty translatable text?
    window.__empty = [];
    new MutationObserver(() => { const n = [...document.querySelectorAll('[data-i18n]')].filter((e) => !e.textContent.trim() && e.offsetParent).length; if (n) window.__empty.push(n); }).observe(document, { subtree: true, childList: true, characterData: true });
  }, lang);
  await page.goto(L.BASE + '/index.html'); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ cls: +window.__cls.reduce((a, e) => a + e.v, 0).toFixed(3), shifts: window.__cls, emptyMax: Math.max(0, ...window.__empty), emptyNow: [...document.querySelectorAll('[data-i18n]')].filter((e) => !e.textContent.trim() && e.offsetParent).length }));
  console.log(vp, lang, JSON.stringify(r));
  await ctx.close();
}
await b.close();
