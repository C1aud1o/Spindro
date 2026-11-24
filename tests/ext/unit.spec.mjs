// Spindro Remote: pure logic and packaging checks (no browser).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectAdapter, originPattern, isWebUrl } from '../../extension/lib/select.js';
import { COMMANDS, VIDEO_COMMANDS, PAGE_COMMANDS, TAB_COMMANDS, cleanArgs } from '../../extension/protocol.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXT = path.join(ROOT, 'extension');
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');

test('adapter selection by host', () => {
  expect(selectAdapter('https://www.youtube.com/watch?v=x')).toBe('youtube');
  expect(selectAdapter('https://youtube.com/watch?v=x')).toBe('youtube');
  expect(selectAdapter('https://music.youtube.com/')).toBe('youtube');
  expect(selectAdapter('https://www.netflix.com/watch/1')).toBe('netflix');
  expect(selectAdapter('https://netflix.com/')).toBe('netflix');
  expect(selectAdapter('https://notyoutube.com/')).toBe('generic'); // suffix lookalikes are not YouTube
  expect(selectAdapter('https://youtube.com.evil.example/')).toBe('generic');
  expect(selectAdapter('https://example.org/video')).toBe('generic');
  expect(selectAdapter('chrome://version')).toBeNull();
  expect(selectAdapter('about:blank')).toBeNull();
  expect(selectAdapter('file:///x.mp4')).toBeNull();
  expect(selectAdapter('garbage')).toBeNull();
});
test('the dev override only applies to local hosts', () => {
  const o = { '127.0.0.1:4000': 'netflix', 'localhost': 'youtube', 'example.org': 'netflix', '127.0.0.1:5000': 'bogus' };
  expect(selectAdapter('http://127.0.0.1:4000/x', o)).toBe('netflix');
  expect(selectAdapter('http://localhost:9/x', o)).toBe('youtube');
  expect(selectAdapter('http://127.0.0.1:5000/x', o)).toBe('generic'); // unknown adapter name ignored
  expect(selectAdapter('https://example.org/x', o)).toBe('generic'); // never on a real site
});
test('origin patterns and web urls', () => {
  expect(originPattern('http://127.0.0.1:4173/a?b')).toBe('http://127.0.0.1/*');
  expect(originPattern('https://www.netflix.com/watch/1')).toBe('https://www.netflix.com/*');
  expect(originPattern('nonsense')).toBeNull();
  expect(isWebUrl('https://a.b')).toBe(true); expect(isWebUrl('chrome-extension://x/y')).toBe(false);
});
test('command lists agree and cover the protocol', () => {
  expect([...VIDEO_COMMANDS, ...PAGE_COMMANDS, ...TAB_COMMANDS, 'fullscreen'].sort()).toEqual([...COMMANDS].sort());
  expect(new Set(COMMANDS).size).toBe(COMMANDS.length);
  // the content script repeats the list: it must be identical
  const m = /const COMMANDS = (\[[^\]]*\])/.exec(read('bridge.js'));
  expect(JSON.parse(m[1].replace(/'/g, '"'))).toEqual(COMMANDS);
  expect(read('bridge.js')).toContain("const NS = 'spindro-remote'");
});
test('argument validation', () => {
  expect(cleanArgs('seekFwd', undefined)).toEqual({});
  expect(cleanArgs('seekFwd', { seconds: 15 })).toEqual({ seconds: 15 });
  for (const bad of [{ seconds: 0 }, { seconds: -1 }, { seconds: 601 }, { seconds: '10' }, { seconds: NaN }, { x: 1 }, [1], 'x', { seconds: 5, y: 1 }, { big: 'x'.repeat(400) }]) expect(cleanArgs('seekFwd', bad)).toBeNull();
});

test('spatial pick (TV-remote navigation)', async () => {
  await import('../../extension/adapters/core.js');
  const { pickSpatial } = globalThis.__spindroRemote;
  const box = (l, t) => ({ left: l, top: t, right: l + 100, bottom: t + 40 });
  // 3 columns x 2 rows
  const g = [box(0, 0), box(200, 0), box(400, 0), box(0, 100), box(200, 100), box(400, 100)];
  expect(pickSpatial(g, g[0], 'right')).toBe(1);
  expect(pickSpatial(g, g[1], 'right')).toBe(2);
  expect(pickSpatial(g, g[0], 'down')).toBe(3);
  expect(pickSpatial(g, g[4], 'up')).toBe(1);
  expect(pickSpatial(g, g[4], 'left')).toBe(3);
  expect(pickSpatial(g, g[2], 'right')).toBe(0); // wraps to the start of the same row
  expect(pickSpatial(g, g[2], 'right', false)).toBeNull();
  expect(pickSpatial(g, g[3], 'down')).toBe(0); // wraps to the top of the same column
  // prefers the aligned neighbour over a nearer but offset one
  const h = [box(0, 0), box(150, 120), box(300, 0)];
  expect(pickSpatial(h, h[0], 'right')).toBe(2);
});

test('manifest: narrow permissions, no inline script, every referenced file exists, locales complete', () => {
  const m = JSON.parse(read('manifest.json'));
  expect(m.manifest_version).toBe(3);
  expect(m.permissions.sort()).toEqual(['scripting', 'storage', 'tabs']);
  expect(m.optional_permissions).toEqual(['debugger']);
  expect(m.host_permissions.sort()).toEqual(['http://127.0.0.1/*', 'http://localhost/*', 'https://*.netflix.com/*', 'https://*.youtube.com/*', 'https://spindro.fit/*']);
  expect(m.optional_host_permissions.sort()).toEqual(['http://*/*', 'https://*/*']);
  expect(m.content_scripts).toHaveLength(1);
  expect(m.content_scripts[0].matches.sort()).toEqual(['http://127.0.0.1/*', 'http://localhost/*', 'https://spindro.fit/*']);
  expect(m.web_accessible_resources).toBeUndefined();
  expect(m.background.type).toBe('module');
  for (const f of [m.background.service_worker, m.action.default_popup, ...m.content_scripts[0].js, ...Object.values(m.icons)]) expect(fs.existsSync(path.join(EXT, f)), f).toBe(true);
  expect(read('popup/popup.html')).not.toMatch(/<script(?![^>]*\bsrc=)/); // no inline script
  for (const f of ['background.js', 'bridge.js', 'popup/popup.js', 'adapters/core.js', 'adapters/generic.js', 'adapters/youtube.js', 'adapters/netflix.js']) {
    expect(read(f), f).not.toMatch(/\beval\s*\(|new Function|importScripts\(\s*['"]https?:|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/); // no remote code, no network
  }
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const l of ['it', 'fr', 'es', 'de']) expect(Object.keys(JSON.parse(read(`_locales/${l}/messages.json`))).sort(), l).toEqual(Object.keys(en).sort());
  for (const l of ['en', 'it', 'fr', 'es', 'de']) expect(JSON.parse(read(`_locales/${l}/messages.json`)).extDescription.message.length).toBeLessThanOrEqual(132);
  // every message used by the popup exists
  const used = [...read('popup/popup.html').matchAll(/data-i18n="(\w+)"/g), ...read('popup/popup.js').matchAll(/msg\('(\w+)'/g)].map((x) => x[1]);
  for (const k of used) expect(en, k).toHaveProperty(k);
});

test('zip: deterministic, only the extension folder, valid', () => {
  const run = () => { execFileSync('node', ['scripts/ext-zip.mjs'], { cwd: ROOT }); return fs.readFileSync(path.join(ROOT, 'dist/spindro-remote.zip')); };
  const a = run(); const b = run();
  expect(crypto.createHash('sha256').update(a).digest('hex')).toBe(crypto.createHash('sha256').update(b).digest('hex'));
  const names = execFileSync('unzip', ['-Z1', 'dist/spindro-remote.zip'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  expect(names).toContain('manifest.json');
  expect(names.every((n) => !n.startsWith('extension/') && !n.startsWith('.'))).toBe(true);
  expect(names).toEqual([...names].sort());
  expect(() => execFileSync('unzip', ['-tq', 'dist/spindro-remote.zip'], { cwd: ROOT })).not.toThrow();
});
