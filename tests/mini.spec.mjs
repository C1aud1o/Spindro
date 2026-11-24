// Finestra mini (Document Picture-in-Picture) e ciclo a 1 Hz che non dipende dai timer della pagina.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(60_000);

test.beforeEach(async ({ page }) => { page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message)); });
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

async function boot(page, { lang = 'en', init } = {}) {
  await page.addInitScript((lg) => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '80'); localStorage.setItem('autoPause', '0'); } localStorage.setItem('lang', lg); } catch { /* */ } }, lang);
  if (init) await page.addInitScript(init);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
}

test('vista: si costruisce su un documento qualsiasi e mostra tutti i dati', async ({ page }) => {
  await page.goto('/index.html');
  const out = await page.evaluate(async () => {
    const { buildMini } = await import('/js/mini-view.js');
    const { t } = await import('/js/i18n.js');
    const doc = document.implementation.createHTMLDocument('x'); const acts = [];
    const v = buildMini(doc, t, (a) => acts.push(a));
    const model = { mode: 'remote', remoteAvailable: true, power: 187.4, target: 190, pct: 95, workout: true, adjust: 'bias', step: 'Sweet spot 2/3', left: '4:12', next: 'Next: Recovery · 120 W', elapsed: '12:30', total: '45:00', progress: 0.28, cadence: '88', hr: '141', bias: '105%', paused: true, last: 'Volume up' };
    v.paint(model);
    const txt = (k) => doc.querySelector(`[data-f="${k}"]`).textContent;
    const res = { power: txt('power'), target: txt('target'), step: txt('step'), left: txt('left'), next: txt('next'), clock: txt('clock'), mode: txt('mode'), last: txt('last'), cadence: txt('cadence'), hr: txt('hr'), bias: txt('bias'), pausedHidden: doc.querySelector('[data-f="paused"]').hidden, pauseBtn: doc.querySelector('[data-act="pause"]').textContent, remoteBtn: doc.querySelector('[data-act="remote"]').textContent, rootMode: v.root.dataset.mode, bar: doc.querySelector('[data-f="bar"]').style.width };
    for (const b of doc.querySelectorAll('[data-act]')) b.click();
    res.acts = acts;
    v.paint({ ...model, mode: 'spindro', paused: false, workout: false, total: '', remoteAvailable: false });
    res.after = { pauseBtn: doc.querySelector('[data-act="pause"]').textContent, remoteHidden: doc.querySelector('[data-act="remote"]').hidden, barHidden: doc.querySelector('.mini-bar').hidden, mode: txt('mode') };
    return res;
  });
  expect(out).toMatchObject({ power: '187', target: 'Target 190 W · 95%', step: 'Sweet spot 2/3', left: '4:12', clock: '12:30 / 45:00', mode: 'Remote', last: 'Volume up', cadence: '88', hr: '141', bias: '105%', pausedHidden: false, pauseBtn: 'Resume', remoteBtn: 'Spindro mode', rootMode: 'remote', bar: '28%' });
  expect(out.acts).toEqual(['pause', 'biasDown', 'biasUp', 'remote', 'spindro', 'close']);
  expect(out.after).toEqual({ pauseBtn: 'Pause', remoteHidden: true, barHidden: true, mode: 'Spindro' });
});

test('finestra PiP vera: si apre col pulsante, mostra l\'allenamento, i pulsanti comandano l\'app, si chiude', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#miniBtn')).toBeVisible(); // Chromium desktop: Document PiP c'è
  await page.locator('#openWorkouts').click();
  await page.locator('[data-wk]').first().click();
  await expect(page.locator('#workoutCard')).toBeVisible();
  await page.locator('#miniBtn').click(); // clic vero = gesto dell'utente
  await expect.poll(() => page.evaluate(() => window.rfMini.isOpen)).toBe(true);
  const pip = (fn, arg) => page.evaluate(([src, a]) => { const w = window.documentPictureInPicture.window; return new Function('w', 'a', `return (${src})(w, a)`)(w, a); }, [fn.toString(), arg]);
  await expect.poll(() => pip((w) => w.document.querySelector('[data-f="step"]').textContent)).not.toBe('');
  expect(await pip((w) => w.document.querySelector('[data-f="mode"]').textContent)).toBe('Spindro');
  expect(await pip((w) => w.document.querySelector('[data-f="target"]').textContent)).toMatch(/Target \d+ W · \d+%/);
  expect(await pip((w) => w.document.querySelector('[data-f="bias"]').firstChild.textContent)).toBe('100%');
  expect(await pip((w) => getComputedStyle(w.document.body).backgroundColor)).toBe('rgb(15, 15, 13)');
  // i dati arrivano dal rullo finto
  await page.evaluate(() => window.__fakeBle.setPower?.(180));
  // + dalla finestra mini = intensità +5 %
  await pip((w) => w.document.querySelector('[data-act="biasUp"]').click());
  await expect(page.locator('#wkBias')).toContainText('105');
  await expect.poll(() => pip((w) => w.document.querySelector('[data-f="bias"]').firstChild.textContent)).toBe('105%');
  // pausa / riprendi
  const running = () => page.evaluate(() => /Pause|Pausa/i.test(document.getElementById('startStop').textContent));
  expect(await running()).toBe(true);
  await pip((w) => w.document.querySelector('[data-act="pause"]').click());
  await expect.poll(running).toBe(false);
  await expect.poll(() => pip((w) => w.document.querySelector('[data-f="paused"]').hidden)).toBe(false);
  // Esc dentro la finestra o "Chiudi"
  await pip((w) => w.document.querySelector('[data-act="close"]').click());
  await expect.poll(() => page.evaluate(() => window.rfMini.isOpen)).toBe(false);
  await expect(page.locator('#miniBtn')).toHaveAttribute('aria-pressed', 'false');
  // si riapre con la scorciatoia da tastiera
  await page.keyboard.press('p');
  await expect.poll(() => page.evaluate(() => window.rfMini.isOpen)).toBe(true);
  await page.keyboard.press('p');
  await expect.poll(() => page.evaluate(() => window.rfMini.isOpen)).toBe(false);
});

test('senza Document PiP il pulsante non c\'è e la scorciatoia non fa nulla', async ({ page }) => {
  await boot(page, { init: () => { try { delete Window.prototype.documentPictureInPicture; Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }); } catch { /* */ } } });
  await expect(page.locator('#miniBtn')).toBeHidden();
  await page.keyboard.press('p');
  expect(await page.evaluate(() => window.rfMini.isOpen)).toBe(false);
});

test('il ciclo a 1 Hz (ERG ripetuto, orologio) regge anche se i timer della pagina sono rallentati: batte da un worker', async ({ page }) => {
  // si spengono i setInterval del ciclo principale (come farebbe Chrome con una scheda nascosta da minuti): resta solo il worker
  await boot(page, { init: () => { const o = window.setInterval.bind(window); window.setInterval = (f, ms, ...a) => (typeof f === 'function' && f.name === 'run' ? 0 : o(f, ms, ...a)); } });
  expect(await page.evaluate(() => window.__ticker.viaWorker)).toBe(true);
  await page.evaluate(() => document.getElementById('startStop').click());
  const sent = () => page.evaluate(() => window.__fakeBle.state.controlLog.filter((b) => b[0] === 0x05).length);
  const a = await sent();
  await page.waitForTimeout(7000);
  expect((await sent()) - a).toBeGreaterThanOrEqual(2); // ~ ogni 2 s anche con lo stesso valore
  const elapsed = await page.evaluate(() => document.getElementById('time').textContent);
  expect(elapsed).not.toBe('0:00');
});
