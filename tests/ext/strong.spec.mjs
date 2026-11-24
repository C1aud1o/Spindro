// Spindro Remote: the paths that normally need a user-approved permission (optional "debugger" and optional host access).
// Headless Chromium cannot show the permission prompt, so this copy of the extension gets them at install time (test-only manifest patch).
// What this proves: the code path works once the permission exists. It does NOT prove the real prompt / banner UX.
import { test, expect } from '@playwright/test';
import { startFixtures, launchExt, getSw, setOverride, openSpindro, send, status, makeTarget } from './helpers.mjs';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);
let fx; let ext; let spindro;
test.beforeAll(async () => {
  fx = await startFixtures();
  ext = await launchExt((m) => { m.permissions.push('debugger'); m.host_permissions.push('http://*/*'); });
  spindro = await openSpindro(ext.ctx, fx);
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
});
test.afterAll(async () => { await ext?.close(); await fx?.close(); });
const open = async (file, title, query = '', host) => { const p = await ext.ctx.newPage(); await p.goto(fx.url(file, host) + query); await makeTarget(spindro, p, title); return p; };
const setStrong = (v) => getSw(ext.ctx).evaluate((x) => chrome.storage.local.set({ strong: x }), v);
// Playwright itself is attached over CDP, so getTargets() always says "attached": ask the debugger as the extension instead
const debuggerAttached = (tabId) => getSw(ext.ctx).evaluate((id) => chrome.debugger.sendCommand({ tabId: id }, 'Runtime.evaluate', { expression: '1' }).then(() => true, () => false), tabId);

test('with host access granted, a site that was permission-missing now works', async () => {
  const p = await open('video.html', 'Video page', '', 'fake.test');
  expect(await send(spindro, 'playPause')).toMatchObject({ ok: true });
  await expect.poll(() => p.evaluate(() => document.getElementById('v').paused)).toBe(false);
  await p.close();
});

test('strong off: strong flag in the handshake is false; on: true', async () => {
  expect((await spindro.evaluate(() => window.__hello())).strong).toBe(false);
  await setStrong(true);
  expect((await spindro.evaluate(() => window.__hello())).strong).toBe(true);
  expect((await status(spindro)).data.strong).toBe(true);
});

test('strong: document fullscreen on a plain video page enters and leaves (trusted gesture)', async () => {
  const p = await open('video.html', 'Video page');
  const r = await send(spindro, 'fullscreen');
  test.info().annotations.push({ type: 'strong-fullscreen-generic', description: JSON.stringify(r) });
  expect(r).toMatchObject({ ok: true, data: { mode: 'strong-document', result: 'enter' } });
  expect(await p.evaluate(() => !!document.fullscreenElement)).toBe(true);
  expect(await send(spindro, 'fullscreen')).toMatchObject({ ok: true, data: { mode: 'strong-document', result: 'exit' } });
  await expect.poll(() => p.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await p.close();
});

test('strong: trusted keys reach a YouTube-like page, and the debugger detaches by itself', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'youtube' });
  const p = await open('yt.html', 'YouTube-like');
  expect(await send(spindro, 'fullscreen')).toMatchObject({ ok: true, data: { mode: 'strong-key' } });
  await expect.poll(() => p.evaluate(() => window.__calls.filter((c) => c.startsWith('key:')))).toEqual(['key:f:true']);
  const tabId = (await status(spindro)).data.target.tabId;
  expect(await debuggerAttached(tabId)).toBe(true);
  await expect.poll(() => debuggerAttached(tabId), { timeout: 8000, intervals: [500] }).toBe(false);
  await p.close();
});

test('strong: Netflix-like page without a player object falls back to the real keyboard shortcuts', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'netflix' });
  const p = await open('nflx.html', 'Netflix-like', '?mode=none');
  for (const c of ['playPause', 'seekFwd', 'seekBack', 'volumeUp', 'mute']) expect(await send(spindro, c)).toMatchObject({ ok: true, data: { mode: 'strong-key' } });
  expect(await p.evaluate(() => window.__calls)).toEqual(['key: :true', 'key:ArrowRight:true', 'key:ArrowLeft:true', 'key:ArrowUp:true', 'key:m:true']);
  expect(await p.evaluate(() => window.__violations)).toEqual([]);
  await p.close();
  // strong off again: the same page gives the plain no-player error
  await setStrong(false);
  const q = await open('nflx.html', 'Netflix-like', '?mode=none');
  expect(await send(spindro, 'playPause')).toMatchObject({ ok: false, error: { code: 'no-player' } });
  await q.close();
});
