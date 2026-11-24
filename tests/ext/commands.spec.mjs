// Spindro Remote: the whole chain page -> bridge -> service worker -> target tab, in Chromium with the unpacked extension.
// Fake pages only: real YouTube and Netflix are NOT exercised here (see docs/extension.md).
import { test, expect } from '@playwright/test';
import { COMMANDS } from '../../extension/protocol.js';
import { startFixtures, launchExt, getSw, setOverride, openSpindro, send, status, makeTarget } from './helpers.mjs';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);
let fx; let ext; let spindro;
test.beforeAll(async () => {
  fx = await startFixtures(); ext = await launchExt(); spindro = await openSpindro(ext.ctx, fx);
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
});
test.afterAll(async () => { await ext?.close(); await fx?.close(); });

const open = async (file, title, query = '') => { const p = await ext.ctx.newPage(); await p.goto(fx.url(file) + query); await makeTarget(spindro, p, title); return p; };
const vstate = (p, sel = '#v') => p.evaluate((s) => { const v = document.querySelector(s); return { paused: v.paused, t: v.currentTime, vol: v.volume, muted: v.muted }; }, sel);
const expectOk = (r) => expect(r, JSON.stringify(r)).toMatchObject({ ok: true });

test('handshake: version, command list, status without a target', async () => {
  const hello = await spindro.evaluate(() => window.__hello());
  expect(hello).toMatchObject({ ns: 'spindro-remote', v: 1, from: 'ext', type: 'hello', version: '0.1.0', strong: false });
  expect(hello.commands).toEqual(COMMANDS);
  const s = await status(spindro);
  expect(s.ok).toBe(true); expect(s.data.spindroTabs).toBe(1); expect(s.data.strong).toBe(false);
  expect(s.data.target).toBeNull(); // the Spindro tab is the only one: never its own target
  expectOk(s);
  const r = await send(spindro, 'playPause');
  expect(r).toMatchObject({ ok: false, error: { code: 'no-target' } });
});

test('HTML5 video: play/pause, seek, volume, mute', async () => {
  const p = await open('video.html', 'Video page');
  expect((await status(spindro)).data.target).toMatchObject({ host: fx.host, adapter: 'generic', title: 'Video page' });
  expectOk(await send(spindro, 'playPause'));
  await expect.poll(async () => (await vstate(p)).paused).toBe(false);
  await p.waitForTimeout(300);
  const t0 = (await vstate(p)).t;
  expectOk(await send(spindro, 'seekFwd'));
  await expect.poll(async () => (await vstate(p)).t).toBeGreaterThan(t0 + 9);
  const t1 = (await vstate(p)).t;
  expectOk(await send(spindro, 'seekBack'));
  await expect.poll(async () => (await vstate(p)).t).toBeLessThan(t1 - 8);
  expectOk(await send(spindro, 'seekFwd', { seconds: 30 }));
  await expect.poll(async () => (await vstate(p)).t).toBeGreaterThan(30);
  await p.evaluate(() => { document.getElementById('v').volume = 0.5; });
  expectOk(await send(spindro, 'volumeUp')); expect((await vstate(p)).vol).toBeCloseTo(0.6, 2);
  expectOk(await send(spindro, 'volumeDown')); expectOk(await send(spindro, 'volumeDown')); expect((await vstate(p)).vol).toBeCloseTo(0.4, 2);
  expectOk(await send(spindro, 'mute')); expect((await vstate(p)).muted).toBe(true);
  expectOk(await send(spindro, 'volumeUp')); expect((await vstate(p)).muted).toBe(false); // volume up unmutes
  expectOk(await send(spindro, 'mute')); expectOk(await send(spindro, 'mute')); expect((await vstate(p)).muted).toBe(false);
  expectOk(await send(spindro, 'playPause'));
  await expect.poll(async () => (await vstate(p)).paused).toBe(true);
  // next / previous / skip click the page's own buttons
  expectOk(await send(spindro, 'next')); expectOk(await send(spindro, 'prev')); expectOk(await send(spindro, 'skip'));
  expect(await p.evaluate(() => window.__clicks)).toEqual(['next', 'prev', 'skip']);
  // bad args are refused before reaching the page
  expect(await send(spindro, 'seekFwd', { seconds: -5 })).toMatchObject({ ok: false, error: { code: 'bad-command' } });
  expect(await send(spindro, 'seekFwd', { seconds: 5, evil: 1 })).toMatchObject({ ok: false, error: { code: 'bad-command' } });
  await p.close();
});

test('HTML5 video inside a same-origin iframe', async () => {
  const p = await open('frame.html', 'Frame page');
  expectOk(await send(spindro, 'playPause'));
  const fr = p.frames().find((f) => f.url().endsWith('video.html'));
  await expect.poll(() => fr.evaluate(() => document.getElementById('v').paused)).toBe(false);
  expectOk(await send(spindro, 'skip'));
  expect(await fr.evaluate(() => window.__clicks)).toEqual(['skip']);
  await p.close();
});

test('page without a video: clear no-player error', async () => {
  const p = await open('nav.html', 'Nav page');
  expect(await send(spindro, 'playPause')).toMatchObject({ ok: false, error: { code: 'no-player' } });
  await p.close();
});

test('YouTube-like page uses the player API', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'youtube' });
  const p = await open('yt.html', 'YouTube-like');
  expect((await status(spindro)).data.target.adapter).toBe('youtube');
  expectOk(await send(spindro, 'playPause')); expectOk(await send(spindro, 'seekFwd')); expectOk(await send(spindro, 'seekBack', { seconds: 5 }));
  expectOk(await send(spindro, 'volumeUp')); expectOk(await send(spindro, 'volumeDown')); expectOk(await send(spindro, 'mute')); expectOk(await send(spindro, 'mute'));
  expectOk(await send(spindro, 'next')); expectOk(await send(spindro, 'prev')); expectOk(await send(spindro, 'skip'));
  const calls = await p.evaluate(() => window.__calls);
  expect(calls).toEqual(['playVideo', 'seekTo:10', 'seekTo:5', 'setVolume:60', 'setVolume:50', 'mute', 'unMute', 'nextVideo', 'previousVideo', 'click:adskip']);
  await p.close();
});

test('Netflix-like page: player object only, currentTime is never written', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'netflix' });
  const p = await open('nflx.html', 'Netflix-like');
  expect((await status(spindro)).data.target.adapter).toBe('netflix');
  expectOk(await send(spindro, 'playPause'));
  expectOk(await send(spindro, 'seekFwd')); expectOk(await send(spindro, 'seekFwd', { seconds: 30 })); expectOk(await send(spindro, 'seekBack'));
  expectOk(await send(spindro, 'volumeUp')); expectOk(await send(spindro, 'volumeDown')); expectOk(await send(spindro, 'mute'));
  expectOk(await send(spindro, 'skip')); expectOk(await send(spindro, 'next'));
  expect(await send(spindro, 'prev')).toMatchObject({ ok: false, error: { code: 'not-supported' } });
  const calls = await p.evaluate(() => window.__calls);
  expect(calls).toEqual(['play', 'seek:10s', 'seek:40s', 'seek:30s', 'setVolume:0.6', 'setVolume:0.5', 'setMuted:true', 'click:player-skip-intro', 'click:next-episode-seek-button']);
  expect(await p.evaluate(() => window.__violations)).toEqual([]);
  await p.close();
});

test('Netflix-like page without the player object: buttons, or a clear no-player error; never currentTime', async () => {
  const b = await open('nflx.html', 'Netflix-like', '?mode=buttons');
  expectOk(await send(spindro, 'playPause')); expectOk(await send(spindro, 'seekFwd')); expectOk(await send(spindro, 'seekBack')); expectOk(await send(spindro, 'skip'));
  expect(await send(spindro, 'volumeUp')).toMatchObject({ ok: false, error: { code: 'no-player' } });
  expect(await b.evaluate(() => window.__calls)).toEqual(['click:control-play-pause-pause', 'click:control-forward10', 'click:control-back10', 'click:player-skip-recap']);
  expect(await b.evaluate(() => window.__violations)).toEqual([]);
  await b.close();
  const n = await open('nflx.html', 'Netflix-like', '?mode=none');
  for (const c of ['playPause', 'seekFwd', 'seekBack', 'mute', 'volumeUp']) expect(await send(spindro, c)).toMatchObject({ ok: false, error: { code: 'no-player' } });
  expect(await n.evaluate(() => window.__violations)).toEqual([]);
  await n.close();
});

test('focus navigation: linear and spatial moves, visible ring, activate, scroll', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
  const p = await open('nav.html', 'Nav page');
  const cur = () => p.evaluate(() => { const e = document.activeElement; return e && e !== document.body ? { id: e.id, outline: e.style.outline, ring: getComputedStyle(e).outlineColor } : null; });
  expectOk(await send(spindro, 'focusNext'));
  expect(await cur()).toMatchObject({ id: 'b1', ring: 'rgb(217, 255, 61)' });
  expectOk(await send(spindro, 'focusRight')); expect((await cur()).id).toBe('b2');
  expectOk(await send(spindro, 'focusDown')); expect((await cur()).id).toBe('b5');
  expectOk(await send(spindro, 'focusLeft')); expect((await cur()).id).toBe('l4');
  expectOk(await send(spindro, 'focusDown')); expect((await cur()).id).toBe('b7');
  expectOk(await send(spindro, 'focusUp')); expect((await cur()).id).toBe('l4');
  expectOk(await send(spindro, 'focusNext')); expect((await cur()).id).toBe('b5'); // b6 is disabled, skipped
  expectOk(await send(spindro, 'focusPrev')); expect((await cur()).id).toBe('l4');
  // only one ring at a time, and the previous element gets its own style back
  expect(await p.evaluate(() => [...document.querySelectorAll('button,a')].filter((e) => e.style.outline).map((e) => e.id))).toEqual(['l4']);
  expect(await p.evaluate(() => document.getElementById('b1').getAttribute('style'))).toBe('left: 20px; top: 20px;');
  expectOk(await send(spindro, 'focusRight')); expectOk(await send(spindro, 'activate'));
  expect(await p.evaluate(() => window.__clicks)).toEqual(['b5']);
  expectOk(await send(spindro, 'scrollDown'));
  await expect.poll(() => p.evaluate(() => scrollY)).toBeGreaterThan(300);
  expectOk(await send(spindro, 'scrollUp'));
  await expect.poll(() => p.evaluate(() => scrollY)).toBe(0);
  await p.close();
});

test('tab commands: back, next/previous tab, focus Spindro / target', async () => {
  const a = await open('video.html', 'Video page');
  const b = await open('nav.html', 'Nav page');
  expectOk(await send(spindro, 'prevTab'));
  await expect.poll(async () => (await status(spindro)).data.target?.title).toBe('Video page');
  expectOk(await send(spindro, 'nextTab'));
  await expect.poll(async () => (await status(spindro)).data.target?.title).toBe('Nav page');
  // back
  await b.goto(fx.url('video.html')); await makeTarget(spindro, b, 'Video page');
  expectOk(await send(spindro, 'back'));
  await expect.poll(() => b.title()).toBe('Nav page');
  // focus Spindro / target
  expectOk(await send(spindro, 'focusSpindro'));
  await expect.poll(() => spindro.evaluate(() => document.visibilityState)).toBe('visible');
  expect((await status(spindro)).data.target.title).toBe('Nav page'); // Spindro never becomes the target
  expectOk(await send(spindro, 'focusTarget'));
  await expect.poll(() => b.evaluate(() => document.visibilityState)).toBe('visible');
  await a.close(); await b.close();
});

test('fullscreen: reports what really happened (headless Chromium has no user gesture)', async () => {
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
  const p = await open('video.html', 'Video page');
  const r = await send(spindro, 'fullscreen');
  test.info().annotations.push({ type: 'fullscreen-first', description: JSON.stringify(r) });
  expect(r.ok === true || ['internal', 'no-player'].includes(r.error?.code)).toBe(true);
  if (r.ok) { expect(['document', 'window', 'strong-key', 'strong-document']).toContain(r.data.mode); const r2 = await send(spindro, 'fullscreen'); test.info().annotations.push({ type: 'fullscreen-second', description: JSON.stringify(r2) }); expect(r2.ok).toBe(true); }
  await p.close();
});
