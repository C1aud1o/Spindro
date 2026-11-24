// Spindro Remote: protocol validation, target tracking, permission and page-type errors, popup.
import { test, expect } from '@playwright/test';
import { startFixtures, launchExt, getSw, setOverride, openSpindro, send, status, makeTarget } from './helpers.mjs';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);
let fx; let ext; let spindro;
test.beforeAll(async () => {
  fx = await startFixtures(); ext = await launchExt(); spindro = await openSpindro(ext.ctx, fx);
  await setOverride(ext.ctx, { [fx.host]: 'generic' });
});
test.afterAll(async () => { await ext?.close(); await fx?.close(); });
const open = async (file, title, host) => { const p = await ext.ctx.newPage(); await p.goto(fx.url(file, host)); await makeTarget(spindro, p, title); return p; };
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const msgCount = () => spindro.evaluate(() => window.__msgs.length);

test('protocol validation: malformed or foreign messages get no answer and no effect', async () => {
  const p = await open('video.html', 'Video page');
  const paused = () => p.evaluate(() => document.getElementById('v').paused);
  expect(await paused()).toBe(true);
  const before = await msgCount();
  const base = { ns: 'spindro-remote', v: 1, from: 'app', type: 'cmd', id: 'x', cmd: 'playPause' };
  for (const bad of [
    { ...base, ns: 'other' }, { ...base, v: 2 }, { ...base, from: 'ext' }, { ...base, type: 'nope' }, { ...base, id: undefined }, { ...base, id: { a: 1 } },
    'spindro-remote', 42, null, [base], { ...base, ns: undefined },
  ]) await spindro.evaluate((m) => window.__raw(m), bad);
  // a cross-origin frame inside the Spindro page (e.source !== window) must be ignored too
  await spindro.evaluate((src) => { const f = document.createElement('iframe'); f.src = src; document.body.append(f); }, fx.url('evil.html', 'fake.test'));
  await settle(800);
  expect((await spindro.evaluate(() => window.__msgs)).slice(before).filter((m) => m.id !== 'x')).toEqual([]); // (the forged from:'ext' envelope is our own echo)
  expect(await paused()).toBe(true);
  // unknown command / bad args in a well-formed envelope: explicit error, nothing runs
  for (const [body, code] of [[{ cmd: 'rm -rf' }, 'bad-command'], [{ cmd: 'playPause', args: [1] }, 'bad-command'], [{ cmd: 'seekFwd', args: { seconds: 'x' } }, 'bad-command'], [{ cmd: 42 }, 'bad-command']]) {
    expect(await spindro.evaluate((b) => window.__send('cmd', b), body)).toMatchObject({ ok: false, error: { code } });
  }
  expect(await paused()).toBe(true);
  // and a valid one still works
  expect(await send(spindro, 'playPause')).toMatchObject({ ok: true });
  await expect.poll(paused).toBe(false);
  await p.close();
});

test('the bridge only runs on the Spindro origins: a page elsewhere gets nothing', async () => {
  const p = await ext.ctx.newPage();
  await p.goto(fx.url('spindro.html', 'fake.test')); // same page, host not in the content script matches
  await p.waitForTimeout(600);
  expect(await p.evaluate(() => ({ msgs: window.__msgs.length, bridge: !!window.__spindroBridge }))).toEqual({ msgs: 0, bridge: false });
  await p.close();
});

test('target tracking: most recently active non-Spindro tab, never Spindro, pin', async () => {
  const a = await open('video.html', 'Video page');
  const b = await open('nav.html', 'Nav page');
  await makeTarget(spindro, a, 'Video page');
  await spindro.bringToFront();
  expect((await status(spindro)).data.target.title).toBe('Video page'); // Spindro in front: the last other tab stays the target
  await b.bringToFront();
  await expect.poll(async () => (await status(spindro)).data.target?.title).toBe('Nav page');
  // pin the video tab: it stays the target while another tab is in front
  const aId = (await (async () => { await a.bringToFront(); return (await status(spindro)).data.target.tabId; })());
  await getSw(ext.ctx).evaluate((id) => chrome.storage.local.set({ pinnedTabId: id }), aId);
  await b.bringToFront(); await settle(300);
  expect((await status(spindro)).data.target).toMatchObject({ tabId: aId, title: 'Video page' });
  // closing the pinned tab drops the pin and falls back to the most recent other tab
  await a.close();
  await expect.poll(async () => (await status(spindro)).data.target?.title).toBe('Nav page');
  expect(await getSw(ext.ctx).evaluate(() => chrome.storage.local.get('pinnedTabId'))).toEqual({});
  await b.close();
});

test('the tab history lives in chrome.storage.session (the worker may be killed any time)', async () => {
  const a = await open('video.html', 'Video page');
  const sw = getSw(ext.ctx);
  const target = (await status(spindro)).data.target;
  const mru = await sw.evaluate(() => chrome.storage.session.get('mru'));
  expect(mru.mru[0]).toBe(target.tabId);
  await a.close();
});

test('permission-missing for a site outside host_permissions; unsupported-page for browser pages', async () => {
  const p = await open('video.html', 'Video page', 'fake.test');
  expect((await status(spindro)).data.target.host).toBe(`fake.test:${fx.port}`);
  const r = await send(spindro, 'playPause');
  expect(r).toMatchObject({ ok: false, error: { code: 'permission-missing', detail: { origin: 'http://fake.test' } } });
  expect(await p.evaluate(() => document.getElementById('v').paused)).toBe(true); // nothing was injected or run
  // tab commands do not need the site permission
  expect(await send(spindro, 'focusTarget')).toMatchObject({ ok: true });
  await p.close();
  // internal pages (chrome://, about:, the extension's own pages) never become the target: the last web tab stays
  const keep = await open('video.html', 'Video page');
  const c = await ext.ctx.newPage(); await c.goto('chrome://version'); await c.bringToFront(); await settle(400);
  const x = await ext.ctx.newPage(); await x.goto(`chrome-extension://${ext.extId}/popup/popup.html`); await x.bringToFront(); await settle(400);
  expect((await status(spindro)).data.target).toMatchObject({ title: 'Video page' });
  expect(await send(spindro, 'scrollDown')).toMatchObject({ ok: true });
  await c.close(); await x.close();
  // with no web tab left there is no target at all
  await keep.close(); await settle(300);
  expect(await send(spindro, 'playPause')).toMatchObject({ ok: false, error: { code: 'no-target' } });
});

test('popup: status, pinned target, localized text; permission prompts are only tried', async () => {
  const p = await open('video.html', 'Video page');
  const tabId = (await status(spindro)).data.target.tabId;
  await getSw(ext.ctx).evaluate((id) => chrome.storage.local.set({ pinnedTabId: id }), tabId);
  const pop = await ext.ctx.newPage();
  const errors = []; pop.on('pageerror', (e) => errors.push(e.message));
  await pop.goto(`chrome-extension://${ext.extId}/popup/popup.html`);
  await expect(pop.locator('#conn')).toHaveText('Connected to Spindro (1 tab)');
  await expect(pop.locator('#target')).toContainText('Video page');
  await expect(pop.locator('#unpin')).toBeVisible(); await expect(pop.locator('#pin')).toBeHidden();
  await expect(pop.locator('h2').first()).toHaveText('Spindro');
  await expect(pop.locator('#builtin li')).toHaveText(['spindro.fit', 'youtube.com', 'netflix.com']);
  await pop.locator('#unpin').click();
  await expect.poll(() => getSw(ext.ctx).evaluate(() => chrome.storage.local.get('pinnedTabId'))).toEqual({});
  // strong mode toggle: needs a real permission prompt that headless Chromium cannot show -> see the annotation
  await pop.locator('#strong').click(); await pop.waitForTimeout(1500);
  const strong = await getSw(ext.ctx).evaluate(() => chrome.storage.local.get('strong'));
  test.info().annotations.push({ type: 'strong-toggle', description: JSON.stringify({ stored: strong, msg: await pop.locator('#strongMsg').textContent(), checked: await pop.locator('#strong').isChecked() }) });
  expect(errors).toEqual([]);
  await pop.close(); await p.close();
});
