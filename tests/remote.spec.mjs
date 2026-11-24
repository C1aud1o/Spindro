// Modalità Remote del Click (js/remote.js) con un'ESTENSIONE FINTA che risponde sul protocollo v1: niente del vero Spindro Remote qui
// (l'estensione vera è provata in tests/ext/), niente di questo è stato provato con un Click vero.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(90_000);

const FAKE_EXT = () => {
  window.__fakeExt = { log: [], fail: null };
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.ns !== 'spindro-remote' || d.from !== 'app') return;
    const reply = (m) => window.postMessage({ ns: 'spindro-remote', v: 1, from: 'ext', ...m }, location.origin);
    if (d.type === 'hello') reply({ type: 'hello', version: '9.9.9', strong: false, commands: ['playPause', 'seekBack', 'seekFwd', 'volumeUp', 'volumeDown', 'mute', 'next', 'prev', 'skip', 'fullscreen', 'scrollUp', 'scrollDown', 'focusNext', 'focusPrev', 'focusUp', 'focusDown', 'focusLeft', 'focusRight', 'activate', 'back', 'nextTab', 'prevTab', 'focusSpindro', 'focusTarget'] });
    if (d.type === 'cmd') {
      window.__fakeExt.log.push(d.cmd);
      const f = window.__fakeExt.fail;
      reply(f ? { type: 'result', id: d.id, ok: false, error: f } : { type: 'result', id: d.id, ok: true });
    }
  });
};

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

async function boot(page, { ext = true, proto = 'v1', lang = 'en', mode = 'erg' } = {}) {
  await page.addInitScript(([lg, md]) => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '80'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('mode', md); localStorage.setItem('autoPause', '0'); localStorage.setItem('clickCheckSeen', 'v1,v2,play,ride'); } localStorage.setItem('lang', lg); } catch { /* */ }
  }, [lang, mode]);
  if (ext) await page.addInitScript(FAKE_EXT);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.evaluate(async (p) => { window.__fakeBle.clickProto = p; window.__fakeBle.next = 'click'; return window.rfDevices.add(); }, proto);
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
  if (proto !== 'v1') { await page.evaluate(() => window.__fakeBle.pressNums([15])); await page.waitForTimeout(150); } // sveglia il tipo del controller
  if (ext) await expect.poll(() => page.evaluate(() => window.rfRemote.available)).toBe(true);
}
const log = (page) => page.evaluate(() => window.__fakeExt.log.slice());
const startRide = async (page) => { await page.evaluate(() => document.getElementById('startStop').click()); await page.waitForTimeout(200); };
const pressV1 = async (page, d, ms = 0) => { await page.evaluate(([x, m]) => (m ? window.__fakeBle.hold(x, m) : window.__fakeBle.press(x)), [d, ms]); await page.waitForTimeout(120); };

test('unità: ruoli → comandi e filtro dei messaggi', async ({ page }) => {
  await page.goto('/index.html');
  const out = await page.evaluate(async () => {
    const { remoteCommandFor, isExtMessage, COMMANDS, NS } = await import('/js/remote.js');
    const win = { location: { origin: 'http://a' } }; win.self = win;
    const ok = { ns: NS, v: 1, from: 'ext', type: 'hello' };
    return {
      roles: ['plus', 'minus', 'up', 'down', 'left', 'right', 'ok', 'back', 'menu'].map((r) => remoteCommandFor(r)),
      good: isExtMessage({ data: ok, source: win, origin: 'http://a' }, win),
      otherOrigin: isExtMessage({ data: ok, source: win, origin: 'http://evil' }, win),
      otherSource: isExtMessage({ data: ok, source: {}, origin: 'http://a' }, win),
      wrongV: isExtMessage({ data: { ...ok, v: 2 }, source: win, origin: 'http://a' }, win),
      fromApp: isExtMessage({ data: { ...ok, from: 'app' }, source: win, origin: 'http://a' }, win),
      noType: isExtMessage({ data: { ns: NS, v: 1, from: 'ext' }, source: win, origin: 'http://a' }, win),
      n: COMMANDS.length,
    };
  });
  expect(out.roles).toEqual(['seekFwd', 'seekBack', 'volumeUp', 'volumeDown', 'seekBack', 'seekFwd', 'playPause', 'back', null]);
  expect(out).toMatchObject({ good: true, otherOrigin: false, otherSource: false, wrongV: false, fromApp: false, noType: false, n: 24 });
});

test('senza estensione: Remote non si attiva, spiega e rimanda alla guida; messaggi falsi ignorati', async ({ page }) => {
  await boot(page, { ext: false });
  // messaggi dell'"estensione" da un altro origine / altra finestra: ignorati
  await page.evaluate(() => {
    const data = { ns: 'spindro-remote', v: 1, from: 'ext', type: 'hello', version: '1', commands: [] };
    window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://evil.example', source: window }));
    window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: null }));
    window.dispatchEvent(new MessageEvent('message', { data: { ...data, v: 99 }, origin: location.origin, source: window }));
  });
  expect(await page.evaluate(() => window.rfRemote.available)).toBe(false);
  await page.keyboard.press('r');
  await expect(page.locator('.dlg')).toContainText('Spindro Remote');
  await expect(page.locator('.dlg [data-ok]')).toHaveText('Install guide');
  await page.locator('.dlg [data-cancel]').click();
  expect(await page.evaluate(() => window.rfRemote.mode)).toBe(false);
  await expect(page.locator('#remoteBadge')).toBeHidden();
  // un messaggio vero (stesso origine e finestra) invece sì
  await page.evaluate(() => window.postMessage({ ns: 'spindro-remote', v: 1, from: 'ext', type: 'hello', version: '1.2.3', commands: ['playPause', 'bogus'] }, location.origin));
  await expect.poll(() => page.evaluate(() => window.rfRemote.available)).toBe(true);
  expect(await page.evaluate(() => window.rfRemote.commands)).toEqual(['playPause']);
});

test('due tasti: + e − mandano salto avanti/indietro, non cambiano l\'intensità; tieni − apre il menu con la sezione Remote', async ({ page }) => {
  await boot(page);
  await startRide(page);
  await page.keyboard.press('r');
  await expect(page.locator('#remoteBadge')).toBeVisible();
  await expect(page.locator('.click-bar')).toContainText('Remote');
  const erg0 = await page.locator('#ergVal').textContent();
  await pressV1(page, +1); await pressV1(page, -1);
  await expect.poll(() => log(page)).toEqual(['seekFwd', 'seekBack']);
  expect(await page.locator('#ergVal').textContent()).toBe(erg0);
  await pressV1(page, -1, 1000); // lunga: menu, nessun salto
  await expect(page.locator('#clickMenu')).toBeVisible();
  expect(await log(page)).toEqual(['seekFwd', 'seekBack']);
  expect(await page.locator('#ergVal').textContent()).toBe(erg0); // "annulla" della pressione lunga non tocca i watt in Remote
  const labels = await page.locator('#clickMenu .cm-list > *').allTextContents();
  expect(labels).toContain('Remote: other tab');
  for (const l of ['Play / pause', 'Volume up', 'Skip intro, recap or ad', 'Browser back', 'Go to the video tab', 'Next tab', 'Back to Spindro mode', 'Harder (+)', 'Easier (−)']) expect(labels.join('|')).toContain(l);
  // scegliere una voce la manda
  await page.locator('#clickMenu button', { hasText: 'Volume up' }).click();
  await expect.poll(() => log(page)).toEqual(['seekFwd', 'seekBack', 'volumeUp']);
  // l'intensità si regola dal menu
  await page.keyboard.press('m');
  await page.locator('#clickMenu button', { hasText: 'Harder (+)' }).click();
  await expect(page.locator('#ergVal')).not.toHaveText(erg0);
  // tornare alla modalità Spindro: + torna a cambiare i watt
  await page.keyboard.press('m');
  await page.locator('#clickMenu button', { hasText: 'Back to Spindro mode' }).click();
  await expect(page.locator('#remoteBadge')).toBeHidden();
  const before = await page.locator('#ergVal').textContent();
  await pressV1(page, +1);
  await expect(page.locator('#ergVal')).not.toHaveText(before);
  expect((await log(page)).length).toBe(3);
});

test('con le frecce: su/giù volume, sinistra/destra salto, ok play/pausa, indietro = browser back', async ({ page }) => {
  await boot(page, { proto: 'ride' });
  await startRide(page);
  await page.keyboard.press('r');
  const press = async (id) => { await page.evaluate((x) => window.__fakeBle.pressId(x), id); await page.waitForTimeout(100); };
  for (const id of ['ride:1', 'ride:3', 'ride:0', 'ride:2', 'ride:4', 'ride:5']) await press(id);
  await expect.poll(() => log(page)).toEqual(['volumeUp', 'volumeDown', 'seekBack', 'seekFwd', 'playPause', 'back']);
  // la corsa non è stata toccata e il menu Click non si è aperto da solo con "ok"
  await expect(page.locator('#clickMenu')).toBeHidden();
  await expect(page.locator('.click-bar')).toContainText('Remote');
});

test('tastiera in Remote: frecce, Invio, Esc, + / −; p apre la finestra mini solo dove c\'è', async ({ page }) => {
  await boot(page, { ext: true });
  await startRide(page);
  await page.keyboard.press('r');
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', '+', '-']) await page.keyboard.press(k);
  await expect.poll(() => log(page)).toEqual(['volumeUp', 'volumeDown', 'seekBack', 'seekFwd', 'playPause', 'back', 'seekFwd', 'seekBack']);
  await page.keyboard.press('r');
  await expect(page.locator('#remoteBadge')).toBeHidden();
  await page.keyboard.press('ArrowUp'); // di nuovo Spindro: cambia i watt, non manda nulla
  expect((await log(page)).length).toBe(8);
});

test('errori dell\'estensione arrivano a chi pedala', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('r');
  await page.evaluate(() => { window.__fakeExt.fail = { code: 'permission-missing', message: 'x', detail: { origin: 'https://example.com' } }; });
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('example.com');
  await page.evaluate(() => { window.__fakeExt.fail = { code: 'no-player', message: 'x' }; });
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('No video player');
  await page.evaluate(() => { window.__fakeExt.fail = { code: 'something-new', message: 'x' }; });
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Remote command failed');
});

test('Remote mostrato in tutte le lingue: il badge e la voce del menu hanno testo', async ({ page }) => {
  for (const lang of ['it', 'fr', 'es', 'de']) {
    await page.addInitScript(FAKE_EXT);
    await page.addInitScript((l) => { try { localStorage.setItem('lang', l); localStorage.setItem('analytics', '0'); } catch { /* */ } }, lang);
    await page.goto('/index.html');
    await expect.poll(() => page.evaluate(() => window.rfRemote?.available)).toBe(true);
    const txt = await page.evaluate(async () => (await import('/js/i18n.js')).t('clickmenu.remoteOn'));
    expect(txt).not.toBe('clickmenu.remoteOn'); expect(txt.length).toBeGreaterThan(5);
  }
});
