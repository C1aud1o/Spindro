// App installabile (PWA): manifest, icone, service worker, avvio offline, invito all'aggiornamento, canale beta separato.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { startServer } from '../scripts/static-server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p));
const manifest = () => JSON.parse(read('manifest.webmanifest').toString('utf8'));
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

test('manifest: campi richiesti per l\'installazione', () => {
  const m = manifest();
  for (const k of ['name', 'short_name', 'description', 'id', 'start_url', 'scope', 'lang', 'dir', 'background_color', 'theme_color']) expect(m[k], k).toBeTruthy();
  expect(m.display).toBe('standalone');
  expect(m.id).toBe('/app/');
  expect(m.start_url).toBe('./'); expect(m.scope).toBe('./');
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  // lo sfondo del manifest è quello dell'app, il colore tema quello del meta tag
  const html = read('index.html').toString('utf8');
  expect(html).toContain(`<meta name="theme-color" content="${m.theme_color}">`);
  expect(read('css/tokens.css').toString('utf8')).toContain(`--ink: ${m.background_color}`); // i token stanno in css/tokens.css
  expect(m.shortcuts.map((s) => s.name)).toEqual(['Workouts', 'Games']);
});

test('manifest: icone 192/512 normali e maskable, tutte esistenti e della misura dichiarata', () => {
  const m = manifest();
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [192, 'maskable'], [512, 'maskable']]) {
    const ic = m.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
    expect(ic, `${size} ${purpose}`).toBeTruthy();
    expect(ic.type).toBe('image/png');
    expect(pngSize(read(ic.src))).toEqual({ w: size, h: size });
  }
  for (const i of m.icons) expect(existsSync(join(ROOT, i.src)), i.src).toBe(true);
  for (const s of m.shortcuts) for (const i of s.icons) expect(existsSync(join(ROOT, i.src)), i.src).toBe(true);
  expect(pngSize(read('icons/apple-touch-icon.png'))).toEqual({ w: 180, h: 180 });
});

test('icone maskable: a tutto campo e con il segno dentro la zona sicura (cerchio del 40%)', async ({ page }) => {
  // si legge il PNG con un canvas: angoli opachi (nessuna trasparenza da mascherare) e pixel lime (il segno) solo entro il raggio sicuro
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const img = new Image(); img.src = '/icons/icon-maskable-512.png'; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = (x, y) => g.getImageData(x, y, 1, 1).data;
    const data = g.getImageData(0, 0, 512, 512).data; let maxR = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const i = (y * 512 + x) * 4; if (data[i] > 150 && data[i + 1] > 200 && data[i + 2] < 140) maxR = Math.max(maxR, Math.hypot(x - 256, y - 256)); }
    return { corners: [px(0, 0)[3], px(511, 0)[3], px(0, 511)[3], px(511, 511)[3]], maxR };
  });
  expect(r.corners).toEqual([255, 255, 255, 255]);
  expect(r.maxR).toBeLessThanOrEqual(0.4 * 512);
});

test('index.html: meta per iOS e collegamento al manifest', () => {
  const html = read('index.html').toString('utf8');
  expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');
  expect(html).toContain('rel="apple-touch-icon" href="icons/apple-touch-icon.png"');
  expect(html).toContain('name="apple-mobile-web-app-capable"');
  expect(html).toContain('name="apple-mobile-web-app-status-bar-style"');
  expect(html).toContain('name="viewport"');
});

test('service worker: gestore fetch, precache con icone, niente skipWaiting automatico, pulizia solo del proprio prefisso', () => {
  const sw = read('sw.js').toString('utf8');
  expect(sw).toMatch(/addEventListener\('fetch'/);
  expect(sw).toMatch(/const CACHE_PREFIX = 'spindro-';/);
  expect(sw).toMatch(/k\.startsWith\(CACHE_PREFIX\)/);
  const list = [...sw.match(/const ASSETS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const f of ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) expect(list, f).toContain(f);
  // skipWaiting solo su richiesta della pagina (messaggio), non nell'evento install
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
  expect(install).not.toContain('skipWaiting');
  expect(sw).toMatch(/addEventListener\('message'[^]*skipWaiting/);
});

test('build beta: manifest con id e nome propri, cache con prefisso beta, /app/ resta intatto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spindro-beta-'));
  try {
    execFileSync('node', ['scripts/copy-web.mjs'], { cwd: ROOT, env: { ...process.env, CHANNEL: 'beta', WEB_DEPLOY: '1', OUT_DIR: dir }, stdio: 'pipe' });
    const m = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    expect(m.id).toBe('/beta/');
    expect(m.name).toContain('Beta'); expect(m.short_name).toBe('Spindro Beta');
    expect(m.scope).toBe('./'); expect(m.start_url).toBe('./'); // relativi: restano dentro /beta/
    expect(m.id).not.toBe(manifest().id);
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
    expect(sw).toContain("const CACHE_PREFIX = 'beta-spindro-';");
    // ogni file del precache è nella build; niente test, documenti o sorgenti nella cartella
    const list = [...sw.match(/const ASSETS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((p) => p !== './');
    expect(list.filter((p) => !existsSync(join(dir, p)))).toEqual([]);
    for (const bad of ['tests', 'docs', 'node_modules', 'store', 'site', 'android']) expect(existsSync(join(dir, bad)), bad).toBe(false);
    expect(readFileSync(join(dir, 'js/build.js'), 'utf8')).toContain("CHANNEL = 'beta'");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Un piccolo server davanti a quello dei test: stessi file, ma sw.js può cambiare versione (Playwright non intercetta gli aggiornamenti del service worker)
async function versionedServer() {
  const inner = await startServer(0);
  let version = 'v92';
  const proxy = http.createServer(async (req, res) => {
    const r = await fetch(inner.url + req.url);
    let body = Buffer.from(await r.arrayBuffer());
    if (new URL(req.url, 'http://x').pathname === '/sw.js') body = Buffer.from(body.toString('utf8').replace(/CACHE_PREFIX \+ 'v\d+'/, `CACHE_PREFIX + '${version}'`));
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  });
  await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${proxy.address().port}`, setVersion: (v) => { version = v; }, close: () => { proxy.close(); inner.server.close(); } };
}

test.describe('con service worker', () => {
  test.use({ serviceWorkers: 'allow', storageState: { cookies: [], origins: [] } });

  test('si installa, parte offline e ricade sulla pagina in cache; un aggiornamento mostra l\'invito a ricaricare', async ({ page, context }) => {
    const srv = await versionedServer();
    try {
      await page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('safetyAck', '1'); } catch { /* */ } });
      await page.goto(`${srv.url}/index.html`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(async () => (await caches.keys()).join())).toBe('spindro-v92');
      const missing = await page.evaluate(async () => {
        const keys = (await (await caches.open('spindro-v92')).keys()).map((r) => new URL(r.url).pathname);
        return ['/index.html', '/manifest.webmanifest', '/icons/icon-512.png', '/js/app.js'].filter((p) => !keys.includes(p));
      });
      expect(missing).toEqual([]);

      // offline: riparte anche con un parametro nell'indirizzo (le scorciatoie ?open=…)
      await context.setOffline(true);
      await page.goto(`${srv.url}/?open=workouts`);
      await expect(page.locator('#power')).toBeVisible();
      await expect(page.locator('#workoutSheet')).toBeVisible();
      await context.setOffline(false);

      // aggiornamento: il server ora ha un'altra versione -> il nuovo worker aspetta e compare l'invito (mai un ricaricamento da solo)
      srv.setVersion('v93');
      await page.goto(`${srv.url}/index.html`);
      await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
      await expect(page.locator('.update-bar')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.update-bar button')).toHaveText('Reload');
      expect(await page.evaluate(async () => (await caches.keys()).sort().join())).toContain('spindro-v92'); // la vecchia cache resta finché non si accetta
      await Promise.all([page.waitForEvent('framenavigated', { timeout: 15_000 }), page.locator('.update-bar button').click()]); // ricaricata solo dopo il tocco
      await page.waitForLoadState('load');
      await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort().join())).toBe('spindro-v93');
    } finally { srv.close(); }
  });
});
