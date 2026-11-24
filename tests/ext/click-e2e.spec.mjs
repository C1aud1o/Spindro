// The whole chain with the REAL extension: fake Zwift Click (tests/fake-ble.js) -> Spindro app (Remote mode) -> extension -> a video in another tab.
// Fixture video page only: no real YouTube / Netflix, no real Click.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startFixtures, launchExt, setOverride } from './helpers.mjs';

const FAKE_BLE = fileURLToPath(new URL('../fake-ble.js', import.meta.url));
const APP = `http://127.0.0.1:${process.env.PORT || 4173}/index.html`;
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
let fx; let ext; let app; let video;

test.beforeAll(async () => {
  fx = await startFixtures(); ext = await launchExt();
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
  await ext.ctx.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('lang', 'en'); localStorage.setItem('clickCheckSeen', 'v1,v2,play,ride'); localStorage.setItem('autoPause', '0'); } } catch { /* other origins */ } });
  await ext.ctx.addInitScript({ path: FAKE_BLE });
  for (const o of ext.ctx.pages()) await o.close().catch(() => {});
  app = await ext.ctx.newPage();
  await app.goto(APP);
  await app.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await app.evaluate(async () => { window.__fakeBle.clickProto = 'v1'; window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await expect(app.locator('#clickStatus')).toContainText('Zwift');
});
test.afterAll(async () => { await ext?.close(); await fx?.close(); });

/** Brings a page to the front and waits until the extension reports it as the target (asked through the app's own bridge client). */
async function makeTarget(page, titleStart) {
  await page.bringToFront();
  await expect.poll(async () => (await app.evaluate(() => window.rfRemote.status()))?.target?.title ?? '', { timeout: 10000 }).toMatch(new RegExp(`^${titleStart}`));
}
const vstate = () => video.evaluate(() => { const v = document.getElementById('v'); return { paused: v.paused, t: v.currentTime, vol: v.volume, muted: v.muted }; });
const press = async (d, ms = 0) => { await app.evaluate(([x, m]) => (m ? window.__fakeBle.hold(x, m) : window.__fakeBle.press(x)), [d, ms]); await app.waitForTimeout(200); };
const pressId = async (id) => { await app.evaluate((x) => window.__fakeBle.pressId(x), id); await app.waitForTimeout(200); };

test('the app finds the extension and Remote mode turns on', async () => {
  await expect.poll(() => app.evaluate(() => window.rfRemote.available)).toBe(true);
  expect(await app.evaluate(() => window.rfRemote.version)).toBe('0.1.0');
  expect(await app.evaluate(() => window.rfRemote.commands.length)).toBe(24);
  await app.evaluate(() => document.getElementById('startStop').click());
  await app.keyboard.press('r');
  await expect(app.locator('#remoteBadge')).toBeVisible();
});

test('two-key Click: + / − seek the video in the other tab, ok-less hold − opens the menu', async () => {
  video = await ext.ctx.newPage(); await video.goto(fx.url('video.html'));
  await makeTarget(video, 'Video page');
  await app.bringToFront();
  await video.evaluate(() => { const v = document.getElementById('v'); v.currentTime = 30; });
  const t0 = (await vstate()).t;
  await press(+1);
  await expect.poll(async () => (await vstate()).t).toBeGreaterThan(t0 + 9);
  await press(-1);
  await expect.poll(async () => (await vstate()).t).toBeLessThan(t0 + 5);
  await press(-1, 1000); // hold: menu, no seek
  await expect(app.locator('#clickMenu')).toBeVisible();
  const t1 = (await vstate()).t;
  await app.locator('#clickMenu button', { hasText: 'Play / pause' }).click();
  await expect.poll(async () => (await vstate()).paused).toBe(false);
  await app.locator('#clickMenu').waitFor({ state: 'hidden' });
  expect((await vstate()).t).toBeGreaterThanOrEqual(t1 - 0.5);
});

test('arrows controller: ok = play/pause, up/down = volume, left/right = seek', async () => {
  await app.evaluate(async () => { window.__fakeBle.clickProto = 'ride'; window.__fakeBle.next = 'click'; });
  // a second controller (Click v2) joins; the v1 one stays connected, both are plain roles for the app
  await app.evaluate(async () => window.rfDevices.add());
  await app.waitForTimeout(400);
  await app.evaluate(() => window.__fakeBle.pressNums([15])); await app.waitForTimeout(200); // wakes the type
  const before = await vstate();
  await pressId('ride:4'); // ok
  await expect.poll(async () => (await vstate()).paused).toBe(!before.paused);
  await video.evaluate(() => { document.getElementById('v').volume = 0.5; });
  await pressId('ride:1'); // up
  await expect.poll(async () => (await vstate()).vol).toBeGreaterThan(0.5);
  await pressId('ride:3'); await pressId('ride:3');
  await expect.poll(async () => (await vstate()).vol).toBeLessThan(0.5);
  const t0 = (await vstate()).t;
  await pressId('ride:2'); // right
  await expect.poll(async () => (await vstate()).t).toBeGreaterThan(t0 + 8);
});

test('a site the extension is not allowed on: the rider is told which one', async () => {
  const other = await ext.ctx.newPage(); await other.goto(fx.url('video.html', 'fake.test'));
  await makeTarget(other, 'Video page');
  await app.bringToFront();
  await app.keyboard.press('Enter');
  await expect(app.locator('#toast')).toContainText('fake.test');
  await expect(app.locator('#toast')).toContainText('not allowed');
});
