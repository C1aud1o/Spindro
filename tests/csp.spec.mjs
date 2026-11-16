// La Content-Security-Policy di index.html non deve bloccare nulla di ciò che l'app (e la WebView Capacitor) usa davvero.
// Capacitor Android serve la pagina da https://localhost e inietta il ponte con addDocumentStartJavaScript (non soggetto alla CSP);
// nel ripiego per WebView vecchie lo inietta come <script> subito dopo <head>, cioè PRIMA del meta CSP (che vale solo per ciò che segue).
// Qui si prova nel browser tutto ciò che la CSP deve lasciare passare e ciò che deve bloccare.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const dir = Object.fromEntries(csp.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));

test('CSP: direttive necessarie alla WebView (blob:, data:, wasm, worker, YouTube) e nessuna scorciatoia larga', () => {
  expect(dir['default-src']).toEqual(["'none'"]);
  // modelli 3D, texture, audio: fetch/XHR su blob: e data: (loader di three.js), immagini da blob:/data:
  expect(dir['connect-src']).toEqual(expect.arrayContaining(["'self'", 'blob:', 'data:']));
  expect(dir['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
  expect(dir['media-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']));
  // decoder meshopt: WebAssembly dentro un Worker creato da blob:
  expect(dir['script-src']).toContain("'wasm-unsafe-eval'");
  expect(dir['worker-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']));
  // stili in linea (attributi style): servono
  expect(dir['style-src']).toContain("'unsafe-inline'");
  // YouTube: script e iframe solo da www.youtube.com
  expect(dir['frame-src']).toEqual(['https://www.youtube.com']);
  expect(dir['script-src']).toContain('https://www.youtube.com');
  // niente scorciatoie larghe
  expect(dir['script-src']).not.toContain("'unsafe-inline'"); expect(dir['script-src']).not.toContain("'unsafe-eval'");
  for (const [k, v] of Object.entries(dir)) { expect(v, k).not.toContain('*'); expect(v, k).not.toContain('http:'); }
  // l'unico script in linea (importmap) è ammesso per hash, e l'hash è quello giusto
  expect(dir['script-src'].some((x) => x.startsWith("'sha256-"))).toBe(true);
});

test('CSP: in un browser vero non scatta nessuna violazione per ciò che l\'app usa; ciò che deve essere bloccato lo è', async ({ page }) => {
  const violations = [];
  await page.exposeFunction('__csp', (v) => violations.push(v));
  await page.addInitScript(() => {
    try { localStorage.setItem('analytics', '0'); } catch { /* */ }
    document.addEventListener('securitypolicyviolation', (e) => window.__csp(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await expect(page.locator('#power')).toBeVisible();

  const r = await page.evaluate(async () => {
    const out = {};
    // fetch di blob: e data: (come i loader di three.js)
    const blobUrl = URL.createObjectURL(new Blob(['x']));
    out.fetchBlob = (await (await fetch(blobUrl)).text()) === 'x';
    out.fetchData = (await (await fetch('data:text/plain;base64,eA==')).text()) === 'x';
    // immagine da blob: e da data:
    const png = await (await fetch('/icons/icon-192.png')).blob();
    for (const [k, src] of [['imgBlob', URL.createObjectURL(png)], ['imgData', await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(png); })]]) {
      out[k] = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });
    }
    out.bitmap = !!(await createImageBitmap(png));
    // WebAssembly (modulo vuoto) sia nella pagina sia dentro un Worker da blob: (il decoder meshopt fa così)
    const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    out.wasm = !!(await WebAssembly.compile(wasm));
    const w = new Worker(URL.createObjectURL(new Blob([`onmessage = async (e) => { try { await WebAssembly.compile(e.data); postMessage('ok'); } catch (err) { postMessage('no ' + err.message); } };`])));
    out.workerWasm = await new Promise((ok) => { w.onmessage = (e) => ok(e.data); w.postMessage(wasm); });
    // stile in linea
    const d = document.createElement('div'); d.setAttribute('style', 'width: 7px'); document.body.append(d);
    out.inlineStyle = getComputedStyle(d).width === '7px'; d.remove();
    // ciò che DEVE essere bloccato
    try { out.eval = !!(0, eval)('1+1'); } catch { out.eval = 'blocked'; }
    out.extImg = await new Promise((ok) => { const i = new Image(); i.onload = () => ok('loaded'); i.onerror = () => ok('blocked'); i.src = 'https://example.com/x.png'; });
    out.extFetch = await fetch('https://example.com/').then(() => 'loaded', () => 'blocked');
    return out;
  });
  expect(r).toMatchObject({ fetchBlob: true, fetchData: true, imgBlob: true, imgData: true, bitmap: true, wasm: true, workerWasm: 'ok', inlineStyle: true, eval: 'blocked', extImg: 'blocked', extFetch: 'blocked' });
  // le tre prove "bloccato" sono le uniche violazioni attese
  expect(violations.filter((v) => !/example\.com|eval/.test(v)), 'violazioni inattese').toEqual([]);
  expect(violations.length).toBeGreaterThanOrEqual(2);
});

test('CSP: un gioco 3D (modelli .glb, texture, decoder meshopt, audio) parte senza violazioni', async ({ page }) => {
  test.setTimeout(150_000);
  const violations = [];
  await page.exposeFunction('__csp', (v) => violations.push(v));
  await page.addInitScript(() => {
    try { localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'en'); } catch { /* */ }
    document.addEventListener('securitypolicyviolation', (e) => window.__csp(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.click('#openGame');
  await page.click('[data-game=racer]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  expect(violations).toEqual([]);
});
