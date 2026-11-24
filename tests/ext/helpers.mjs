// Shared by the extension tests: fixture server, Chromium with the unpacked extension, helpers to talk to the bridge.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const EXT_SRC = fileURLToPath(new URL('../../extension', import.meta.url));
export const EXT = EXT_SRC;
const FIX = fileURLToPath(new URL('./fixtures', import.meta.url));

// 90 s of silence as 8 kHz mono WAV: a <video> can play, seek and change volume on it, and every Chromium build decodes it
function wav(seconds = 90) {
  const rate = 8000; const n = rate * seconds; const b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

export async function startFixtures() {
  const media = wav();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); const name = url.pathname.replace(/^\/+/, '') || 'video.html';
    if (name === 'media.wav') {
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const s = +m[1] || 0; const e = m[2] ? Math.min(+m[2], media.length - 1) : media.length - 1;
        res.writeHead(206, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${media.length}`, 'Content-Length': e - s + 1 });
        return res.end(media.subarray(s, e + 1));
      }
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': media.length }); return res.end(media);
    }
    const file = path.join(FIX, path.basename(name));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { port, url: (p, host = '127.0.0.1') => `http://${host}:${port}/${p}`, host: `127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

/** patch(manifest) lets a test grant at install time what the real extension only gets from a user prompt (headless Chromium cannot show prompts). */
export async function launchExt(patch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spindro-ext-'));
  let EXT = EXT_SRC;
  if (patch) {
    EXT = path.join(dir, 'ext'); fs.cpSync(EXT_SRC, EXT, { recursive: true });
    const mf = path.join(EXT, 'manifest.json'); const m = JSON.parse(fs.readFileSync(mf, 'utf8')); patch(m); fs.writeFileSync(mf, JSON.stringify(m));
  }
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    headless: false, // real headless is selected by the --headless=new argument: extensions only load in the new headless mode
    viewport: { width: 1000, height: 700 },
    args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP fake.test 127.0.0.1'],
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  return { ctx, sw, extId, close: async () => { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
/** The service worker can be restarted by Chrome: always ask for the current one. */
export const getSw = (ctx) => ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
export const setOverride = async (ctx, map) => { const sw = getSw(ctx); await sw.evaluate((m) => chrome.storage.local.set({ devAdapterOverride: m }), map); };

/** Opens the fake Spindro page and does the handshake. */
export async function openSpindro(ctx, fx) {
  const old = ctx.pages();
  const page = await ctx.newPage();
  for (const o of old) await o.close(); // the blank tab Chromium starts with would be a target of its own
  await page.goto(fx.url('spindro.html'));
  await page.waitForFunction(() => window.__hello, null, { timeout: 15000 });
  await page.evaluate(() => window.__hello());
  return page;
}
export const send = (page, cmd, args) => page.evaluate(([c, a]) => window.__send('cmd', { cmd: c, args: a }), [cmd, args]);
export const status = (page) => page.evaluate(() => window.__send('status', {}));

/** Brings a page to the front and waits until the extension considers it the target. */
export async function makeTarget(spindro, page, titleStart) {
  await page.bringToFront();
  const deadline = Date.now() + 8000; let s;
  while (Date.now() < deadline) {
    s = await status(spindro);
    if (s.ok && s.data.target && (s.data.target.title || '').startsWith(titleStart)) return s.data.target;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`target never became "${titleStart}": ${JSON.stringify(s)}`);
}
