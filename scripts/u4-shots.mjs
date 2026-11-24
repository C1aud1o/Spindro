// U4 liquid glass: renders every scene of the app (phone 390×844 and desktop 1280×720) from the real code with a fake trainer / fake Click.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/u4-shots.mjs --base=http://127.0.0.1:4180 --out=/some/dir [--only=home,settings] [--games=0] [--a11y=0]
// scripts/u4-sheets.mjs then composes the contact sheets from two such directories (before / after).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = opt('base', 'http://127.0.0.1:4173'); const OUT = opt('out', '/tmp/u4'); const ONLY = opt('only', '').split(',').filter(Boolean);
const WITH_GAMES = opt('games', '1') !== '0'; const WITH_A11Y = opt('a11y', '1') !== '0';
mkdirSync(OUT, { recursive: true });
const FAKE = new URL('../tests/fake-ble.js', import.meta.url).pathname;
const exe = process.env.PW_CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const VP = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 720 } };
const want = (name) => !ONLY.length || ONLY.some((o) => name.includes(o));
const day = 864e5;
const HISTORY = [
  { t: Date.now() - 1 * day, dur: 3180, km: 24.1, avgW: 168, kj: 534, best: { 5: 262, 60: 231, 300: 205 } },
  { t: Date.now() - 3 * day, dur: 2400, km: 18.4, avgW: 152, kj: 365, best: { 5: 240, 60: 208 } },
  { t: Date.now() - 6 * day, dur: 3600, km: 27.9, avgW: 174, kj: 626, best: { 5: 280, 60: 240, 300: 214 } },
  { t: Date.now() - 9 * day, dur: 1800, km: 13.2, avgW: 148, kj: 266, best: { 5: 230 } },
];

async function open(name, vp, { solid = false, contrast = false, workout = false, click = false, game = null } = {}) {
  const ctx = await browser.newContext({ viewport: VP[vp], deviceScaleFactor: vp === 'phone' ? 2 : 1, serviceWorkers: 'block', hasTouch: vp === 'phone', isMobile: vp === 'phone' });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.addInitScript((o) => {
    localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'en');
    localStorage.setItem('gameQuality', 'low'); localStorage.setItem('rideHistory', JSON.stringify(o.history)); localStorage.setItem('mass', '75');
    if (o.solid) localStorage.setItem('reduceGlass', '1');
    window.__spindroSeed = 12345;
  }, { history: HISTORY, solid });
  await page.addInitScript({ path: FAKE });
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  if (contrast) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] }); }
  if (click) { await page.evaluate(async () => { window.__fakeBle.clickProto = 'v1'; window.__fakeBle.next = 'click'; return window.rfDevices.add(); }); }
  await page.waitForTimeout(700);
  return { ctx, page };
}
const settle = async (page, ms = 700) => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
const snap = async (page, name) => { await settle(page); await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log('shot', name); };
const startWorkout = async (page, idx = 2) => {
  await page.locator('#openWorkouts').click(); await page.locator('[data-wk]').nth(idx).click(); await page.waitForTimeout(600);
  if (await page.locator('#startStop').isVisible().catch(() => false)) { const t = await page.locator('#startStop').textContent(); if (/start|avvia/i.test(t)) await page.locator('#startStop').click(); }
  await page.waitForTimeout(3500);
};

for (const vp of ['phone', 'desktop']) {
  if (want('home')) { const { ctx, page } = await open('home', vp); await snap(page, `app-home-${vp}`); await ctx.close(); }
  if (want('dash')) { const { ctx, page } = await open('dash', vp); await startWorkout(page); await snap(page, `app-dashboard-${vp}`); await ctx.close(); }
  if (want('workouts')) { const { ctx, page } = await open('workouts', vp); await page.locator('#openWorkouts').click(); await snap(page, `app-workouts-${vp}`); await ctx.close(); }
  if (want('devices')) { const { ctx, page } = await open('devices', vp); await page.locator('#deviceBar').click(); await snap(page, `app-devices-${vp}`); await ctx.close(); }
  if (want('settings')) { const { ctx, page } = await open('settings', vp); await page.locator('#openSettings').click(); await snap(page, `app-settings-${vp}`); await ctx.close(); }
  if (want('history')) { const { ctx, page } = await open('history', vp); await page.locator('#openHistoryCard').click(); await snap(page, `app-history-${vp}`); await ctx.close(); }
  if (want('click')) {
    const { ctx, page } = await open('click', vp, { click: true }); await startWorkout(page); await page.keyboard.press('m'); await page.waitForTimeout(500);
    await snap(page, `app-clickmenu-${vp}`); await ctx.close();
  }
  if (want('dialog')) {
    const { ctx, page } = await open('dialog', vp); await startWorkout(page, 1);
    await page.evaluate(() => document.getElementById('finishRide')?.click()); await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('reset')?.click()); await page.waitForTimeout(600);
    await snap(page, `app-dialog-${vp}`); await ctx.close();
  }
  if (want('toast')) {
    const { ctx, page } = await open('toast', vp); await page.locator('#deviceBar').click(); await page.locator('#addDevice').click(); await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT, `app-toast-${vp}.png`) }); console.log('shot', `app-toast-${vp}`); await ctx.close();
  }
}

// ---- games: menu, and the in-game HUD with the workout strip for two games ----
if (WITH_GAMES) {
  for (const vp of ['phone', 'desktop']) {
    if (want('gamemenu')) { const { ctx, page } = await open('gm', vp); await page.locator('#openGame').click(); await page.waitForTimeout(500); await snap(page, `games-menu-${vp}`); await ctx.close(); }
    for (const game of ['horde', 'gruppetto']) {
      if (!want(`game-${game}`) && !want('game')) continue;
      const { ctx, page } = await open(`g-${game}`, vp);
      try {
        await startWorkout(page, 2);
        await page.locator('#openGame').click({ force: true }).catch(() => page.keyboard.press('g'));
        await page.waitForTimeout(500);
        await page.click(`[data-game=${game}]`);
        await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 150000 });
        await snap(page, `games-${game}-menu-${vp}`);
        await page.evaluate(() => { const g = window.__game; if (g.menu?.start) { g.menu.age = 1; g.menu.start(); } else { g.stateT = 5; g.selT = 1; if (typeof g.begin === 'function') g.begin(); else g.input(1); } });
        await page.waitForFunction(() => window.__game?.stripInfo?.(), null, { timeout: 150000 });
        await page.waitForTimeout(4000);
        await snap(page, `games-${game}-play-${vp}`);
      } catch (e) { console.log('game shot failed', game, vp, e.message.split('\n')[0]); }
      await ctx.close();
    }
  }
}

// ---- accessibility variants (new look only): solid panels, high contrast, keyboard focus ----
if (WITH_A11Y) {
  for (const vp of ['phone', 'desktop']) {
    if (want('a11y-solid')) { const { ctx, page } = await open('a', vp, { solid: true }); await startWorkout(page); await snap(page, `a11y-solid-dashboard-${vp}`); await page.keyboard.press('Escape'); await ctx.close(); }
    if (want('a11y-solid')) { const { ctx, page } = await open('a', vp, { solid: true }); await page.locator('#openSettings').click(); await snap(page, `a11y-solid-settings-${vp}`); await ctx.close(); }
    if (want('a11y-contrast')) { const { ctx, page } = await open('a', vp, { contrast: true }); await page.locator('#openSettings').click(); await snap(page, `a11y-contrast-settings-${vp}`); await ctx.close(); }
    if (want('a11y-focus')) {
      const { ctx, page } = await open('a', vp); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await snap(page, `a11y-focus-home-${vp}`);
      await page.locator('#openSettings').focus(); await page.keyboard.press('Enter'); for (let i = 0; i < 4; i++) await page.keyboard.press('Tab'); await snap(page, `a11y-focus-settings-${vp}`); await ctx.close();
    }
  }
}
await browser.close();
