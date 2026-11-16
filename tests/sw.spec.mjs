// Service worker: avvio offline (anche con parametri nell'indirizzo), una risposta 500 non entra in cache,
// un aggiornamento sostituisce la cache vecchia e serve subito il contenuto nuovo. Il server è privato di questo test,
// così la "nuova versione" si simula senza toccare i file.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
test.use({ serviceWorkers: 'allow' });
test.setTimeout(60_000);

let srv; let base; const mode = { v2: false, breakUi: false };
test.beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = join(root, p);
    if (mode.breakUi && p === '/js/ui.js') { res.writeHead(500).end('boom'); return; }
    if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end('nope'); return; }
    let body = readFileSync(f);
    if (mode.v2 && p === '/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = CACHE_PREFIX \+ '[^']+'/, "const CACHE = CACHE_PREFIX + 'v999'"));
    if (mode.v2 && p === '/locales/en.json') body = Buffer.from(body.toString().replace('"home.start": "Start"', '"home.start": "Go!"'));
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.afterAll(() => srv.close());

test('service worker: offline start, no cached errors, update swaps the cache and serves the new content', async ({ page, context }) => {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await context.addInitScript(() => { try { if (!localStorage.getItem('__q')) { localStorage.setItem('__q', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('lang', 'en'); } } catch { /* */ } });
  await page.goto(base + '/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await expect(page.locator('#openSettings')).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await page.evaluate(() => caches.keys())).toHaveLength(1);

  await context.setOffline(true);
  for (const url of ['/index.html', '/', '/index.html?code=abc&scope=read', '/?utm=x']) {
    errs.length = 0;
    await page.goto(base + url); await expect(page.locator('#openSettings'), `offline ${url}`).toBeVisible();
    expect(errs, `offline ${url}`).toEqual([]);
  }

  // un 500 su un modulo, mentre si è online, non deve finire in cache al posto del file buono
  await context.setOffline(false);
  mode.breakUi = true; await page.goto(base + '/index.html'); await page.waitForTimeout(500); mode.breakUi = false;
  await context.setOffline(true); errs.length = 0;
  await page.goto(base + '/index.html'); await expect(page.locator('#openSettings')).toBeVisible();
  expect(errs).toEqual([]);

  // aggiornamento: nuova cache, vecchia cancellata, contenuto nuovo subito e anche offline
  await context.setOffline(false); mode.v2 = true;
  await page.goto(base + '/index.html');
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await expect.poll(() => page.evaluate(() => caches.keys().then((k) => k.join())), { timeout: 10_000 }).toBe('spindro-v999');
  await page.reload(); await expect(page.locator('#openSettings')).toBeVisible();
  await expect(page.locator('#startStop')).toHaveText('Go!');
  await context.setOffline(true); await page.reload(); await expect(page.locator('#openSettings')).toBeVisible();
  await expect(page.locator('#startStop')).toHaveText('Go!');
});
