// Functional probes (interaction defects). Prints PASS/FAIL lines. Needs `PORT=4180 node tests/serve.mjs`.
import * as L from './lib.mjs';
const b = await L.launch();
const res = [];
const check = (name, ok, extra = '') => { res.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const val = (p, id) => p.evaluate((id) => document.getElementById(id).textContent, id);

{ // arrow keys / Escape with a sheet open
  const p = await L.newPage(b, { vp: 's390', seed: { mode: 'erg', ftp: '200' } });
  const before = await val(p, 'controlValue');
  await p.click('#openSettings'); await p.waitForTimeout(300);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('PageUp'); await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(200);
  check('arrow keys inside an open sheet do not change the target', (await val(p, 'controlValue')) === before, `before=${before} after=${await val(p, 'controlValue')}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('Escape closes the settings sheet', await p.evaluate(() => document.getElementById('settingsSheet').hidden));
  check('focus returns to the opener after closing a sheet', await p.evaluate(() => document.activeElement?.id === 'openSettings'), `active=${await p.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id)}`);
  check('body scroll unlocked after close', await p.evaluate(() => document.body.style.overflow === ''));
  await p.close();
}
{ // editor: delete block must not raise the "delete workout" confirm
  const p = await L.newPage(b, { vp: 's390' });
  await p.click('#openWorkouts'); await p.waitForTimeout(300);
  await p.click('#wkNew'); await p.waitForTimeout(400);
  await p.click('#edSave'); await p.waitForTimeout(500);
  await p.click('#wkNew'); await p.waitForTimeout(400);
  const n = await p.locator('.ed-block').count();
  await p.locator('.ed-block [data-del]').first().click(); await p.waitForTimeout(300);
  check('editor: deleting a block does not open a confirm dialog', (await p.locator('.dlg').count()) === 0, `blocks=${n}, dialogs=${await p.locator('.dlg').count()}`);
  await p.close();
}
{ // double tap on start
  const p = await L.newPage(b, { vp: 's390', seed: { mode: 'gears' } });
  await L.connectTrainer(p);
  await p.dblclick('#startStop'); await p.waitForTimeout(500);
  const running = await p.evaluate(() => document.body.classList.contains('riding'));
  const label = await val(p, 'startStop');
  res.push(`INFO  dblclick on start → riding=${running}, button="${label}"`);
  await p.close();
}
{ // history weekly bars across a DST change (Europe/Rome, 2026-10-25 fall back)
  const ctx = await b.newContext({ timezoneId: 'Europe/Rome', viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('safetyAck', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); } catch {} });
  const err = []; p.on('pageerror', (e) => err.push(e.message));
  await p.goto(L.BASE + '/index.html'); await p.waitForTimeout(500);
  const out = await p.evaluate(async () => {
    const { renderHistory } = await import('./js/history.js');
    const real = Date; const fixed = real.UTC(2026, 10, 15, 12); // Sun 15 Nov 2026, after the DST end
    const el = document.createElement('div'); document.body.append(el);
    // one ride per week for the last 8 weeks, each on Wednesday noon (local)
    const hist = []; for (let k = 7; k >= 0; k--) { const d = new real(fixed); d.setDate(d.getDate() - 5 - k * 7); hist.push({ t: d.getTime(), dur: 1800, km: 10, avgW: 150, kj: 300, best: {} }); }
    globalThis.Date = class extends real { constructor(...a) { if (!a.length) super(fixed); else super(...a); } static now() { return fixed; } };
    renderHistory(el, hist, 200);
    globalThis.Date = real;
    return hist.length;
  });
  const counted = await p.evaluate(() => 'n/a');
  res.push(`INFO  DST probe ran (${out} rides); see tests/history-dst for assertion`);
  await ctx.close();
}
await b.close();
console.log(res.join('\n'));
