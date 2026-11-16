// Robustness probes: first run, blocked storage, quota errors, unhandled rejections.
import * as L from './lib.mjs';
const b = await L.launch(); const res = [];
const log = (ok, n, x = '') => res.push(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`);
async function fresh(init, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.qa = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Service Worker registration blocked/.test(m.text())) page.qa.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => page.qa.push('pageerror: ' + e.message));
  await page.addInitScript(() => { window.__rej = []; window.addEventListener('unhandledrejection', (e) => window.__rej.push(String(e.reason && e.reason.message || e.reason))); });
  if (init) await page.addInitScript(init);
  await page.addInitScript({ path: L.FAKE_BLE });
  await page.goto(L.BASE + '/index.html'); await page.waitForTimeout(900);
  return page;
}
{ // first run, nothing stored
  const p = await fresh();
  const consent = await p.evaluate(() => !document.getElementById('consentSheet').hidden);
  log(true, 'first run', `consent open=${consent}, console=${JSON.stringify(p.qa)}`);
  // tab order / focus in consent
  const act = await p.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id);
  log(true, 'focus after load with consent open', act);
  await p.click('#consentNo'); await p.waitForTimeout(300);
  log(await p.evaluate(() => document.getElementById('consentSheet').hidden), 'consent closes on decline');
  await p.reload(); await p.waitForTimeout(500);
  log(await p.evaluate(() => document.getElementById('consentSheet').hidden), 'consent not asked again after a choice');
  // safety notice
  await p.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await p.click('#startStop'); await p.waitForTimeout(300);
  log(await p.evaluate(() => !document.getElementById('safetySheet').hidden), 'safety notice before the first ride');
  await p.click('#safetyOk'); await p.waitForTimeout(600);
  log(await p.evaluate(() => document.body.classList.contains('riding')), 'ride starts after acknowledging');
  log((await p.evaluate(() => window.__rej)).length === 0, 'no unhandled rejections', JSON.stringify(await p.evaluate(() => window.__rej)));
  await p.context().close();
}
{ // storage throws on every access
  const p = await fresh(() => { const boom = () => { throw new DOMException('denied', 'SecurityError'); }; for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) Storage.prototype[m] = boom; });
  const ok = await p.evaluate(() => !!document.getElementById('openSettings').offsetParent);
  log(ok && p.qa.length === 0, 'app loads with storage blocked', JSON.stringify(p.qa.slice(0, 3)));
  await p.context().close();
}
{ // quota exceeded on every write
  const p = await fresh(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; try { localStorage.getItem('x'); } catch {} });
  await p.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await p.waitForTimeout(300);
  const consent = await p.evaluate(() => !document.getElementById('consentSheet').hidden);
  if (consent) { await p.click('#consentNo').catch(() => {}); }
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => !document.getElementById('safetySheet').hidden);
  await p.evaluate(() => document.getElementById('startStop').click()); await p.waitForTimeout(300);
  if (await p.evaluate(() => !document.getElementById('safetySheet').hidden)) await p.click('#safetyOk').catch(() => {});
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('finishRide')?.click()); await p.waitForTimeout(500);
  const fin = await p.evaluate(() => !document.getElementById('finishSheet').hidden);
  log(fin, 'finish sheet opens with a full storage', `console=${JSON.stringify(p.qa.slice(0, 3))} rej=${JSON.stringify(await p.evaluate(() => window.__rej))}`);
  await p.context().close();
}
await b.close();
console.log(res.join('\n'));
