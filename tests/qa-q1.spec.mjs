// QA q1 (app): regressioni trovate nel giro di collaudo di tutta l'app (docs/qa/q1-app.md).
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('ftp', '200'); } } catch { /* */ } });
  await page.addInitScript({ path: FAKE_BLE });
});
test.afterEach(async ({ page }) => { expect(page.errors, 'JavaScript errors').toEqual([]); });

test('Esc closes the top layer and the arrow keys do not change the target behind a sheet', async ({ page }) => {
  await page.goto('/index.html');
  const before = await page.locator('#controlValue').textContent();
  await page.click('#openSettings');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('PageUp'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('#controlValue')).toHaveText(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsSheet')).toBeHidden();
  await expect(page.locator('#openSettings')).toBeFocused(); // il focus torna a chi aveva aperto il pannello
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);
});

test('while a sheet is open the page behind is inert and the scroll lock follows the sheets', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#openSettings');
  expect(await page.evaluate(() => document.querySelector('main').inert && document.querySelector('header.top').inert)).toBe(true);
  await page.click('#openHistory'); // Storico sostituisce Impostazioni: il blocco resta
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.click('[data-close="historySheet"]');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);
});

test('weekly bars: with a DST change each of the last 8 weeks still counts its ride', async ({ browser }) => {
  for (const timezoneId of ['Europe/Rome', 'America/New_York', 'Australia/Lord_Howe']) {
    const ctx = await browser.newContext({ timezoneId, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/index.html');
    const counts = await page.evaluate(async () => {
      const { weekBuckets } = await import('./js/history.js');
      const now = new Date(2026, 10, 15, 12).getTime(); // domenica 15 novembre 2026
      const hist = [];
      for (let k = 7; k >= 0; k--) { const d = new Date(now); d.setDate(d.getDate() - 5 - k * 7); hist.push({ t: d.getTime(), dur: 1800 }); } // un'uscita per settimana, mercoledì a mezzogiorno
      return weekBuckets(hist, now).map((w) => w.n);
    });
    expect(counts, timezoneId).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    await ctx.close();
  }
});

test('a 4-digit wattage fits the ride card at 360 px (no horizontal scroll)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await page.click('#startStop');
  await page.evaluate(() => window.__fakeBle.setPower(1234));
  await expect(page.locator('#power')).toHaveText('1234');
  const m = await page.evaluate(() => { const r = document.getElementById('power').getBoundingClientRect(); return { right: r.right, left: r.left, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; });
  expect(m.right).toBeLessThanOrEqual(m.vw); expect(m.left).toBeGreaterThanOrEqual(0); expect(m.sw).toBeLessThanOrEqual(m.vw);
});

test('history sheet never overflows the viewport (German, FTP 450, 40 rides)', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('__h')) { localStorage.setItem('__h', '1'); localStorage.setItem('lang', 'de'); localStorage.setItem('ftp', '450');
    const rides = Array.from({ length: 40 }, (_, i) => ({ t: Date.now() - (40 - i) * 2e8, dur: 1800 + i * 300, km: 14 + i, avgW: 150 + i, kj: 270 + i * 60, np: 170, maxW: 400, best: { 5: 520, 60: 300, 300: 240, 1200: 200 + i }, avgHr: 140 }));
    localStorage.setItem('rideHistory', JSON.stringify(rides)); } });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html');
  await page.click('#openHistoryCard');
  await expect(page.locator('#historySheet')).toBeVisible();
  await page.locator('#historySheet summary').first().click();
  const m = await page.evaluate(() => { const b = document.querySelector('#historySheet .sheet-body'); return { sw: b.scrollWidth, cw: b.clientWidth }; });
  expect(m.sw).toBeLessThanOrEqual(m.cw);
});

// ---- FIT: file valido (CRC, lunghezza) e orari strettamente crescenti anche dopo pausa/ripristino ----
function decodeFit(bytes) {
  const crc = (b, c = 0) => { const T = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
    for (const x of b) { let t = T[c & 0xf]; c = (c >> 4) & 0xfff; c = c ^ t ^ T[x & 0xf]; t = T[c & 0xf]; c = (c >> 4) & 0xfff; c = c ^ t ^ T[(x >> 4) & 0xf]; } return c; };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hl = bytes[0]; const dataSize = dv.getUint32(4, true);
  const out = { headerCrcOk: crc(bytes.subarray(0, 12)) === dv.getUint16(12, true), fileCrcOk: crc(bytes.subarray(0, bytes.length - 2)) === dv.getUint16(bytes.length - 2, true), sizeOk: bytes.length === hl + dataSize + 2, recordTs: [], msgs: [] };
  const defs = {}; let p = hl;
  while (p < hl + dataSize) {
    const h = bytes[p++];
    if (h & 0x40) { const local = h & 0xf; p += 2; const global = dv.getUint16(p, true); p += 2; const n = bytes[p++]; const f = []; for (let i = 0; i < n; i++) { f.push([bytes[p], bytes[p + 1]]); p += 3; } defs[local] = { global, f }; }
    else { const d = defs[h & 0xf]; const vals = {}; for (const [num, size] of d.f) { vals[num] = size === 4 ? dv.getUint32(p, true) : size === 2 ? dv.getUint16(p, true) : bytes[p]; p += size; } out.msgs.push(d.global); if (d.global === 20) out.recordTs.push(vals[253]); }
  }
  out.consumedAll = p === hl + dataSize;
  return out;
}
test('FIT: valid file; two samples in the same second (after pause or restore) are not both written', async ({ page }) => {
  await page.goto('/index.html');
  const bytes = await page.evaluate(async () => {
    const { encodeFit } = await import('./js/fit.js');
    const t0 = Date.UTC(2026, 10, 14, 9, 0, 0);
    const log = []; for (let i = 0; i < 30; i++) log.push({ t: t0 + i * 1000, power: 150 + i, cadence: 85, hr: 140, speed: 8.3, distance: i * 8 });
    log.push({ t: t0 + 29 * 1000 + 400, power: 200, cadence: 85, hr: 141, speed: 8.3, distance: 240 }); // ripresa dopo pausa a meno di 1 s dall'ultimo
    for (let i = 0; i < 20; i++) log.push({ t: t0 + 600000 + i * 1000, power: 180, cadence: 80, hr: null, speed: 7, distance: 250 + i * 7 }); // dopo 10 minuti di pausa
    return [...encodeFit(log)];
  });
  const d = decodeFit(Uint8Array.from(bytes));
  expect(d.headerCrcOk && d.fileCrcOk && d.sizeOk && d.consumedAll).toBe(true);
  expect(d.recordTs.length).toBe(50);
  for (let i = 1; i < d.recordTs.length; i++) expect(d.recordTs[i]).toBeGreaterThan(d.recordTs[i - 1]);
  expect(d.msgs.filter((m) => m === 18).length).toBe(1); // una sola sessione
});

test('.zwo import: a hostile Repeat value and a very long name are capped', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const { parseZwo } = await import('./js/workouts.js');
    const w = parseZwo(`<workout_file><name>${'N'.repeat(300)}</name><workout><IntervalsT Repeat="99999999" OnDuration="30" OnPower="1.1" OffDuration="30" OffPower="0.5"/></workout></workout_file>`, 'x.zwo');
    return { n: w.steps.length, name: w.name.length };
  });
  expect(r.n).toBeLessThanOrEqual(200); expect(r.name).toBeLessThanOrEqual(60);
});

test('a restored ride resumes without re-announcing the 10-minute and 5-km milestones already passed', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('__r')) { localStorage.setItem('__r', '1'); localStorage.setItem('mode', 'gears');
    const t0 = Date.now() - 2200000; const log = Array.from({ length: 20 }, (_, i) => ({ t: t0 + i * 1000, power: 150, cadence: 80, hr: null, speed: 8, distance: 15000 + i * 8 }));
    localStorage.setItem('ride-freedom-session', JSON.stringify({ elapsed: 2100, distance: 15000, energy: 300, powerSum: 3000, samples: 20, log, saved: false, stravaUrl: null, historySaved: false })); } });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await expect(page.locator('#time')).toHaveText('35:00');
  await page.click('#startStop');
  await page.waitForTimeout(2600);
  expect(await page.locator('#toast').textContent()).not.toMatch(/30|35|15 ?km|10 ?km|5 ?km/);
});

test('"Delete all data" leaves nothing behind: the closing page does not write the session key back', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#openSettings');
  await page.locator('#wipeData').scrollIntoViewIfNeeded();
  await page.click('#wipeData');
  await Promise.all([page.waitForEvent('framenavigated'), page.locator('.dlg [data-ok]').click()]); // la pagina si ricarica dopo il messaggio
  await page.waitForLoadState('load');
  await expect(page.locator('#openSettings')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ride-freedom-session'))).toBeNull();
});

test('the app still starts when the browser blocks localStorage (blocked cookies)', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { for (const n of ['localStorage', 'sessionStorage']) Object.defineProperty(window, n, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await expect(page.locator('#power')).toHaveText('150'); // il codice dell'app è vivo
  expect(errs).toEqual([]);
  await ctx.close();
});

test('with a full storage the safety notice is acknowledged for the session and the ride can start', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.removeItem('safetyAck'); localStorage.removeItem('analytics'); } catch { /* */ } Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; }); // il file di configurazione precarica safetyAck: qui si parte da zero
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await expect(page.locator('#consentSheet')).toBeVisible();
  await page.click('#consentNo');
  await expect(page.locator('#consentSheet')).toBeHidden(); // anche se la scelta non si può salvare
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await page.click('#startStop');
  await page.click('#safetyOk');
  await expect(page.locator('body')).toHaveClass(/riding/);
  await page.waitForTimeout(2200); // il salvataggio della sessione fallisce a ogni passo: nessun errore deve uscire
  expect(errs).toEqual([]);
  await ctx.close();
});

test('GPX: empty coordinates, non-numeric elevation, a stationary track and a very long track do not break the route', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const { parseGpx, at } = await import('./js/route.js');
    const gpx = (pts, name = 'x') => `<gpx><trk><name>${name}</name><trkseg>${pts}</trkseg></trk></gpx>`;
    const out = {};
    const pt = (lat, lon, ele) => `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? '' : `<ele>${ele}</ele>`}</trkpt>`;
    // quota non numerica: la pendenza resta un numero
    const a = parseGpx(gpx(Array.from({ length: 50 }, (_, i) => pt(45 + i * 0.001, 9, i === 10 ? 'n/a' : 100 + i)).join('')));
    out.gradeFinite = Number.isFinite(at(a, 500).grade) && Number.isFinite(a.gain);
    // coordinate vuote = punti scartati (non (0,0))
    const b = parseGpx(gpx(`<trkpt lat="" lon=""/>` + Array.from({ length: 50 }, (_, i) => pt(45 + i * 0.001, 9, 100)).join('')));
    out.noOcean = b.pts.every((p) => p.lat > 40);
    // fermo: nessun percorso
    try { parseGpx(gpx(Array.from({ length: 20 }, () => pt(45, 9, 100)).join(''))); out.stationary = 'accepted'; } catch { out.stationary = 'rejected'; }
    // 200 000 punti (più degli argomenti ammessi da Math.min(...)): il disegno non deve lanciare
    const big = parseGpx(gpx(Array.from({ length: 200000 }, (_, i) => pt(45 + i * 0.00002, 9 + (i % 7) * 1e-5, 100 + (i % 50))).join('')));
    const c1 = document.createElement('canvas'); const c2 = document.createElement('canvas');
    const { drawElevation, drawMap } = await import('./js/route.js');
    try { drawElevation(c1, big, 1000); drawMap(c2, big, 1000); out.bigDraw = 'ok'; } catch (e) { out.bigDraw = e.message; }
    out.name = parseGpx(gpx(pt(45, 9) + pt(45.01, 9), 'N'.repeat(200))).name.length;
    return out;
  });
  expect(r).toEqual({ gradeFinite: true, noOcean: true, stationary: 'rejected', bigDraw: 'ok', name: 60 });
});

test('finish → resume → finish again updates the same history entry (no lost minutes, no duplicate)', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('__f')) { localStorage.setItem('__f', '1'); localStorage.setItem('mode', 'gears');
    const t0 = Date.now() - 200000; const log = Array.from({ length: 100 }, (_, i) => ({ t: t0 + i * 1000, power: 150, cadence: 80, hr: null, speed: 8, distance: i * 8 }));
    localStorage.setItem('ride-freedom-session', JSON.stringify({ elapsed: 100, distance: 800, energy: 15, powerSum: 15000, samples: 100, log, saved: false, stravaUrl: null, historySaved: false })); } });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await page.click('#finishRide');
  const hist = () => page.evaluate(() => JSON.parse(localStorage.getItem('rideHistory') || '[]').map((h) => ({ t: h.t, dur: h.dur })));
  const first = await hist(); expect(first).toHaveLength(1); expect(first[0].dur).toBeGreaterThanOrEqual(100);
  await page.click('[data-close="finishSheet"]');
  await page.click('#startStop'); await page.waitForTimeout(2600);
  await page.click('#finishRide');
  const second = await hist();
  expect(second).toHaveLength(1);
  expect(second[0].t).toBe(first[0].t);
  expect(second[0].dur).toBeGreaterThan(first[0].dur);
});

test('no layout shift on load, even when the translations arrive late', async ({ page }) => {
  await page.route('**/locales/*.json', async (route) => { await new Promise((r) => setTimeout(r, 300)); await route.continue(); });
  await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto('/index.html');
  await expect(page.locator('#openSettings')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.05);
});

test('a 9-hour ride time fits its cell on a 360 px screen in French and German', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const lang of ['fr', 'de']) {
    await page.addInitScript((lang) => { if (!localStorage.getItem('__9' + lang)) { localStorage.setItem('__9' + lang, '1'); localStorage.setItem('lang', lang);
      const log = [{ t: Date.now() - 1000, power: 150, cadence: 80, hr: null, speed: 8, distance: 1 }];
      localStorage.setItem('ride-freedom-session', JSON.stringify({ elapsed: 32400, distance: 268920, energy: 5100, powerSum: 5832000, samples: 32400, log, saved: false, stravaUrl: null, historySaved: false })); } }, lang);
    await page.goto('/index.html');
    await expect(page.locator('#time')).toHaveText('9:00:00');
    const m = await page.evaluate(() => { const e = document.getElementById('time'); return { sw: e.scrollWidth, cw: e.clientWidth, page: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; });
    expect(m.sw, lang).toBeLessThanOrEqual(m.cw); expect(m.page, lang).toBeLessThanOrEqual(m.vw);
    await page.evaluate(() => localStorage.clear());
  }
});

test('with a full storage a settings change does not throw: the app keeps working and warns once', async ({ page }) => {
  await page.addInitScript(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === '__seeded' || k === 'analytics' || k === 'lang' || k === 'ftp' && !window.__full) return real.call(this, k, v); throw new DOMException('full', 'QuotaExceededError'); }; window.__full = false; });
  await page.goto('/index.html');
  await page.evaluate(() => { window.__full = true; });
  await page.click('#openSettings');
  await page.fill('#ftp', '260'); await page.press('#ftp', 'Tab');
  await expect(page.locator('#ftp')).toHaveValue('260');
  await expect(page.locator('#toast')).toContainText('out of storage space');
});

test('a restored (paused) ride still lets you reach Settings', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('__s')) { localStorage.setItem('__s', '1');
    const log = [{ t: Date.now() - 1000, power: 150, cadence: 80, hr: null, speed: 8, distance: 1 }];
    localStorage.setItem('ride-freedom-session', JSON.stringify({ elapsed: 120, distance: 800, energy: 15, powerSum: 15000, samples: 120, log, saved: false, stravaUrl: null, historySaved: false })); } });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveClass(/paused/);
  await page.click('#openSettings');
  await expect(page.locator('#settingsSheet')).toBeVisible();
});

test('backup import skips device-specific keys (consent, safety ack, known Bluetooth devices)', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { localStorage.setItem('analytics', '0'); localStorage.removeItem('devKnown'); });
  await page.click('#openSettings');
  const file = JSON.stringify({ app: 'spindro', version: 1, data: { analytics: '1', devKnown: '[{"id":"x"}]', seenTrainers: '["x"]', ftp: '287', rideHistory: '[]' } });
  await page.setInputFiles('#backupIn', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await page.locator('.dlg [data-ok]').click();
  await page.waitForLoadState('load'); await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({ analytics: localStorage.getItem('analytics'), devKnown: localStorage.getItem('devKnown'), ftp: localStorage.getItem('ftp') }));
  expect(s.ftp).toBe('287'); expect(s.analytics).toBe('0'); expect(s.devKnown).toBeNull();
});

test('at most one banner above the Today card: connection error > lost device > suggestion > report hint > update bar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html');
  const shown = () => page.evaluate(() => ['connectHelp', 'dropBanner', 'suggest', 'reportHint'].concat(['upd']).filter((id) => { const e = id === 'upd' ? document.querySelector('.update-bar') : document.getElementById(id); return e && !e.hidden && getComputedStyle(e).display !== 'none'; }));
  await page.evaluate(() => { const b = document.createElement('div'); b.className = 'update-bar'; b.innerHTML = '<span>new</span><button class="ghost">Reload</button>'; document.querySelector('main').prepend(b); for (const id of ['connectHelp', 'dropBanner', 'suggest', 'reportHint']) document.getElementById(id).hidden = false; });
  expect(await shown()).toEqual(['connectHelp']);
  await page.evaluate(() => { document.getElementById('connectHelp').hidden = true; });
  expect(await shown()).toEqual(['dropBanner']);
  await page.evaluate(() => { document.getElementById('dropBanner').hidden = true; });
  expect(await shown()).toEqual(['suggest']);
  await page.evaluate(() => { document.getElementById('suggest').hidden = true; });
  expect(await shown()).toEqual(['reportHint']);
  await page.evaluate(() => { document.getElementById('reportHint').hidden = true; });
  expect(await shown()).toEqual(['upd']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.body.classList.add('riding')); // never mid-ride
  expect(await shown()).toEqual([]);
});

test('the Strava and Garmin buttons use the neutral app style (no brand colours)', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(() => ['uploadStrava', 'garminUp', 'stravaConnect', 'stravaPublicConnect'].map((id) => { const e = document.getElementById(id); const cs = getComputedStyle(e); return [id, e.className, cs.backgroundColor]; }));
  for (const [id, cls, bg] of r) { expect(cls, id).toBe('ghost'); expect(bg, id).not.toMatch(/rgb\((17, 169, 237|252, 82, 0)\)/); }
});
