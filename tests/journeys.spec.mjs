// Cinque persone, un percorso ciascuna, dall'inizio alla fine (QA q1, giro 3). Con QA_SHOTS=<cartella> salva uno screenshot a ogni passo.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const SHOTS = process.env.QA_SHOTS;
test.setTimeout(120_000);
test.use({ storageState: { cookies: [], origins: [] } }); // si parte da zero, come un utente nuovo

async function shot(page, journey, step) { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${journey}-${step}.png` }); } }
async function boot(page, { lang, seed = {}, clock = false, path = '/index.html' }) {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.errs = errs;
  await page.addInitScript(({ lang, seed }) => { try { if (!localStorage.getItem('__j')) { localStorage.setItem('__j', '1'); if (lang) localStorage.setItem('lang', lang); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } } catch { /* */ } }, { lang, seed });
  await page.addInitScript({ path: FAKE_BLE });
  if (clock) await page.clock.install();
  await page.goto(path);
}
const addTrainer = (page) => page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
const SEED_OK = { analytics: '0', safetyAck: '1' };

test('(a) nuovo utente, telefono, italiano, solo rullo: consenso → avviso → collega → ERG 3 min → pausa → riprendi → fine → FIT → immagine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await boot(page, { lang: 'it', clock: true });
  await shot(page, 'a', '1-open');
  await expect(page.locator('#consentSheet')).toBeVisible();
  await page.click('#consentNo');
  await expect(page.locator('#consentSheet')).toBeHidden();
  await shot(page, 'a', '2-welcome');
  await expect(page.locator('#welcomeConnect')).toBeVisible();
  await page.click('#welcomeConnect'); // un solo tocco: parte la scelta Bluetooth
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await shot(page, 'a', '3-connected');
  await page.click('#startStop');
  await expect(page.locator('#safetySheet')).toBeVisible(); await shot(page, 'a', '4-safety');
  await page.click('#safetyOk');
  await expect(page.locator('body')).toHaveClass(/riding/);
  await page.clock.runFor(180_000); await shot(page, 'a', '5-riding');
  await expect(page.locator('#time')).toHaveText('3:00');
  await page.click('#startStop'); await expect(page.locator('body')).toHaveClass(/paused/); await shot(page, 'a', '6-paused');
  await page.click('#startStop'); await page.clock.runFor(5000); await expect(page.locator('#time')).toHaveText('3:05');
  await page.click('#finishRide'); await expect(page.locator('#finishSheet')).toBeVisible(); await page.clock.runFor(2000); await shot(page, 'a', '7-finish');
  const dl = page.waitForEvent('download'); await page.click('#saveFit'); const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.fit$/); const bytes = readFileSync(await d.path()); expect(bytes.length).toBeGreaterThan(200);
  await expect(page.locator('#toast')).toContainText(/Download|salvat/i); await shot(page, 'a', '8-saved');
  const dl2 = page.waitForEvent('download'); await page.click('#shareImg'); expect((await dl2).suggestedFilename()).toMatch(/\.png$/);
  expect(page.errs).toEqual([]);
});

const press = (page, d) => page.evaluate((x) => window.__fakeBle.press(x), d).then(() => page.waitForTimeout(80));
const hold = (page, d, ms = 900) => page.evaluate(([x, m]) => window.__fakeBle.hold(x, m), [d, ms]);
const focusInfo = (page) => page.evaluate(() => { const e = document.querySelector('.cn-focus'); return e ? `${e.tagName}#${e.id} "${(e.textContent || '').trim().slice(0, 30)}"` : null; });
async function goTo(page, target) {
  for (let i = 0; i < 150; i++) {
    const ok = await page.evaluate((tg) => { const e = document.querySelector('.cn-focus'); if (!e) return false; return tg.re ? new RegExp(tg.re, 'i').test(e.textContent) : e.matches(tg.sel); }, typeof target === 'string' ? { sel: target } : { re: target.source });
    if (ok) return;
    await press(page, +1);
  }
  throw new Error(`Auswahl kam nicht bei ${target} an: ${await focusInfo(page)}`);
}

test('(b) Stammkunde, deutsch, Trainer + Controller, nur die Tasten des Controllers: Training starten → Spiel öffnen → zurück → beenden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const hist = [{ t: Date.now() - 864e5, dur: 1800, km: 15, avgW: 150, kj: 270, best: {} }];
  await boot(page, { lang: 'de', seed: { ...SEED_OK, mode: 'gears', autoPause: '0', ftp: '200', rideHistory: hist } });
  await addTrainer(page);
  await page.evaluate(async () => { window.__fakeBle.next = 'click'; await window.rfDevices.add(); });
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
  await expect(page.locator('.cn-focus')).toBeVisible(); await shot(page, 'b', '1-home-controller');
  await goTo(page, '#openWorkouts'); await hold(page, +1);
  await expect(page.locator('#workoutSheet')).toBeVisible(); await shot(page, 'b', '2-workouts');
  await goTo(page, '[data-wk]'); await hold(page, +1);
  await expect(page.locator('body')).toHaveClass(/in-workout/); await page.waitForTimeout(500); await shot(page, 'b', '3-workout-running');
  await hold(page, -1); await expect(page.locator('#clickMenu')).toBeVisible(); await shot(page, 'b', '4-menu');
  await goTo(page, /^Spiele/); await hold(page, +1);
  await expect(page.locator('#gameMenu')).toBeVisible(); await shot(page, 'b', '5-games');
  await hold(page, +1);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu'); await shot(page, 'b', '6-in-game');
  await page.waitForTimeout(800); await page.evaluate(() => window.__fakeBle.pressBit(5, 1000)); // im Spiel öffnet das Halten von B das Menü (Controller mit Pfeiltasten)
  await expect(page.locator('#clickMenu')).toBeVisible();
  await goTo(page, /Spiel beenden/); await hold(page, +1);
  await expect(page.locator('#gameMenu')).toBeVisible();
  await page.evaluate(() => window.__fakeBle.pressBit(5, 900)); // B = zurück: schließt die Spieleliste
  await expect(page.locator('#gamePanel')).toBeHidden(); await shot(page, 'b', '7-back');
  await expect(page.locator('body')).toHaveClass(/in-workout/); // das Training läuft weiter
  await hold(page, -1); await goTo(page, /Training beenden/); await hold(page, +1);
  await expect(page.locator('.dlg')).toBeVisible(); await shot(page, 'b', '8-confirm');
  await hold(page, +1);
  await expect(page.locator('body')).not.toHaveClass(/in-workout/);
  await hold(page, -1); await goTo(page, /Fahrt beenden/); await hold(page, +1);
  await expect(page.locator('#finishSheet')).toBeVisible(); await shot(page, 'b', '9-finish');
  expect(page.errs).toEqual([]);
});

test('(c) English, no trainer at all: what can they do, is it clear it is a demo, do games work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await boot(page, { lang: 'en', seed: SEED_OK });
  await expect(page.locator('#welcome')).toBeVisible(); await shot(page, 'c', '1-home');
  await expect(page.locator('#welcomeConnect')).toBeVisible();
  await page.click('#startStop'); await page.waitForTimeout(1200);
  await expect(page.locator('#noSource')).toBeVisible(); await shot(page, 'c', '1b-started-without-trainer'); // not silently riding at 0 W: it says why and offers to connect
  await page.click('#startStop'); await page.click('#finishRide'); await page.click('#reset');
  if (await page.locator('.dlg').count()) await page.locator('.dlg [data-ok]').click();
  await expect(page.locator('body')).not.toHaveClass(/riding/);
  await page.click('#openGame'); await expect(page.locator('#gameMenu')).toBeVisible(); await shot(page, 'c', '2-games');
  await page.locator('#gameMenu [data-game]').first().click();
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu'); await shot(page, 'c', '3-game-menu');
  await expect.poll(async () => { await page.mouse.click(195, 707); await page.waitForTimeout(500); return page.evaluate(() => window.__game?.state); }, { timeout: 60_000 }).not.toBe('menu'); // START (the button ignores taps while the 3D models load)
  await page.waitForTimeout(2500); await shot(page, 'c', '4-playing');
  for (let i = 0; i < 3 && await page.locator('#gamePanel').isVisible(); i++) { await page.click('#closeGame'); await page.waitForTimeout(600); } // first tap leaves the stage, next closes the list
  await expect(page.locator('#gamePanel')).toBeHidden(); await shot(page, 'c', '5-back-home');
  await page.click('#openWorkouts'); await expect(page.locator('#workoutSheet')).toBeVisible(); await shot(page, 'c', '6-workouts');
  expect(page.errs).toEqual([]);
});

test('(d) Français, un plan: choisir → séance du jour → "demain" → rien aujourd\'hui → sauter → abandonner', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const hist = [{ t: new Date(2026, 10, 10, 18).getTime(), dur: 1800, km: 15, avgW: 150, kj: 270, best: {} }];
  const day = (d, h = 9) => new Date(2026, 10, 16 + d, h, 0, 0);
  await page.clock.install({ time: day(0) });
  await boot(page, { lang: 'fr', seed: { ...SEED_OK, ftp: '200', autoPause: '0', rideHistory: hist } });
  await addTrainer(page);
  await page.click('#openWorkouts'); await page.click('#tabPlans'); await shot(page, 'd', '1-plans');
  await page.locator('[data-plan]').first().click(); await shot(page, 'd', '2-chosen');
  await page.click('#planStart'); await expect(page.locator('#toast')).toContainText(/plan/i);
  await page.click('[data-close="workoutSheet"]');
  await expect(page.locator('#planCard')).toBeVisible(); await shot(page, 'd', '3-today');
  await page.locator('[data-pl-start]').click();
  await expect(page.locator('body')).toHaveClass(/in-workout/);
  await page.clock.runFor(45 * 60 * 1000); // la séance entière
  await expect(page.locator('body')).not.toHaveClass(/in-workout/); await shot(page, 'd', '4-done');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('plan')).done).length)).toBe(1); // la séance compte dans le plan
  const tick = () => page.clock.runFor(700); // con l'orologio finto i controlli di Playwright aspettano un fotogramma: lo si fa passare
  await tick(); await page.click('#finishRide'); await tick(); await page.click('#reset'); await tick();
  if (await page.locator('.dlg').count()) { await page.locator('.dlg [data-ok]').click(); await tick(); }
  await page.clock.resume();
  // demain (jour 1): pas de séance prévue
  await page.clock.setSystemTime(day(1)); await page.waitForTimeout(1600); // l'app era rimasta aperta tutta la notte
  await expect(page.locator('#planCard')).toBeVisible(); await shot(page, 'd', '5-tomorrow');
  await expect(page.locator('[data-pl-start]')).toHaveCount(0);
  // jour 2: nouvelle séance; on la saute
  await page.clock.setSystemTime(day(2)); await page.waitForTimeout(1600);
  await expect(page.locator('[data-pl-skip]')).toBeVisible(); await shot(page, 'd', '6-day2');
  await page.click('[data-pl-skip]'); await page.locator('.dlg [data-ok]').click(); await shot(page, 'd', '7-skipped');
  await expect(page.locator('[data-pl-skip]')).toHaveCount(0);
  // abandon
  await page.click('#openWorkouts'); await page.click('#tabPlans'); await page.click('#planAbandon'); await shot(page, 'd', '8-abandon-ask');
  await page.locator('.dlg [data-ok]').click();
  await page.click('[data-close="workoutSheet"]'); await expect(page.locator('#planCard')).toBeHidden(); await shot(page, 'd', '9-no-plan');
  expect(page.errs).toEqual([]);
});

test('(e) Español, escritorio 1280×720, solo teclado: todo se alcanza, el foco se ve, Esc cierra, nada depende del ratón', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page, { lang: 'es', seed: { ...SEED_OK, mode: 'gears', autoPause: '0', ftp: '200', rideHistory: [{ t: Date.now() - 864e5, dur: 1800, km: 15, avgW: 150, kj: 270, best: {} }] } });
  await addTrainer(page); await shot(page, 'e', '1-home');
  const focused = () => page.evaluate(() => { const e = document.activeElement; return e && e !== document.body ? `${e.tagName}#${e.id}` : ''; });
  // Tab recorre solo controles reales, y cada uno muestra el foco
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const rc = e.getBoundingClientRect(); return { id: `${e.tagName}#${e.id}.${e.className}`.slice(0, 50), vis: rc.width > 0 && rc.height > 0, ring: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none', onscreen: rc.bottom > 0 && rc.top < innerHeight, name: (e.getAttribute('aria-label') || e.textContent || e.title || [...(e.labels || [])].map((l) => l.textContent).join('') || '').trim().length > 0 }; });
    if (!r) continue; seen.push(r);
  }
  expect(seen.length).toBeGreaterThan(15);
  for (const r of seen) { expect(r.vis, r.id).toBe(true); expect(r.name, `${r.id} sin nombre`).toBe(true); expect(r.ring, `${r.id} sin foco visible`).toBe(true); }
  await shot(page, 'e', '2-tabbed');
  // abrir Ajustes con el teclado, moverse dentro, Esc cierra y el foco vuelve
  await page.locator('#openSettings').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#settingsSheet')).toBeVisible(); await shot(page, 'e', '3-settings');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#settingsSheet'))).toBe(true); // el foco no se escapa a la página de detrás
  await page.keyboard.press('Escape'); await expect(page.locator('#settingsSheet')).toBeHidden();
  await expect(page.locator('#openSettings')).toBeFocused();
  // iniciar con la barra espaciadora, cambiar marcha con flechas, pausar
  await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(' '); await expect(page.locator('body')).toHaveClass(/riding/);
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#gearNum')).toHaveText('13');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await expect(page.locator('#gearNum')).toHaveText('11'); await shot(page, 'e', '4-riding');
  await page.waitForFunction(() => window.rfDevices.ride().samples >= 1); // sin una muestra registrada, pausar vuelve al inicio: se espera al tick de 1 Hz, no a un plazo fijo
  await page.keyboard.press(' ');
  await expect(page.locator('body')).toHaveClass(/paused/);
  // juegos con la tecla g, Esc para volver
  await page.keyboard.press('g'); await expect(page.locator('#gamePanel')).toBeVisible(); await shot(page, 'e', '5-games');
  await page.keyboard.press('Escape'); await expect(page.locator('#gamePanel')).toBeHidden();
  // terminar: botón alcanzable con Tab+Enter
  await page.locator('#finishRide').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#finishSheet')).toBeVisible(); await shot(page, 'e', '6-finish');
  await page.keyboard.press('Escape'); await expect(page.locator('#finishSheet')).toBeHidden();
  expect(page.errs).toEqual([]);
});
