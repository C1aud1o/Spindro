// Conformità: consenso e nessuna richiesta prima del sì, niente Google Fonts, Content-Security-Policy, avviso di sicurezza, licenze.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = readFileSync(`${ROOT}js/config.js`, 'utf8');
const GC_HOST = /goatcounter|gc\.zgo\.at/i;

// config.js con GoatCounter attivo (nel repo lo è già; qui lo si impone). Ogni richiesta uscita dalla pagina viene registrata.
async function setup(page, { answer } = {}) {
  page.errors = []; page.requests = []; page.csp = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('request', (r) => page.requests.push(r.url()));
  await page.route('**/js/config.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: CONFIG.replace(/GOATCOUNTER_URL = '[^']*'/, "GOATCOUNTER_URL = 'https://test.goatcounter.example/count'"),
  }));
  // Qualunque richiesta esterna è fermata qui (nessuna rete vera), ma resta registrata sopra.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.goatcounter = window.goatcounter || {}; window.goatcounter.count = () => {};' }));
  await page.addInitScript((a) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    try { localStorage.setItem('lang', 'en'); if (a != null) localStorage.setItem('analytics', a); } catch { /* */ }
  }, answer ?? null);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
}
const gcRequests = (page) => page.requests.filter((u) => GC_HOST.test(u));
const external = (page) => page.requests.filter((u) => /^https?:/.test(u) && !u.startsWith('http://127.0.0.1'));

test('nessuna risposta al consenso: zero richieste a GoatCounter, anche usando l\'app', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#consentSheet')).toBeVisible();
  await page.waitForTimeout(800);
  expect(gcRequests(page)).toEqual([]);
  expect(await page.locator('script[src*="zgo.at"]').count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('analytics'))).toBeNull();
  // una scheda chiusa senza rispondere (tocco fuori) non vale come sì
  await page.locator('#consentSheet').click({ position: { x: 2, y: 2 } });
  await page.click('#openSettings');
  await page.waitForTimeout(300);
  expect(gcRequests(page)).toEqual([]);
  expect(page.errors).toEqual([]);
});

test('"No": zero richieste a GoatCounter, scelta ricordata, anche dopo aver pedalato', async ({ page }) => {
  await setup(page);
  await page.click('#consentNo');
  await page.click('#startStop'); // l'avviso di sicurezza è già stato visto (config di Playwright)
  await page.waitForTimeout(800);
  expect(gcRequests(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('#consentSheet')).toBeHidden();
  await page.waitForTimeout(500);
  expect(gcRequests(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('analytics'))).toBe('0');
});

test('"Sì" e "No" hanno lo stesso peso e il sì parte solo dopo il tocco', async ({ page }) => {
  await setup(page);
  const [no, yes] = await Promise.all([page.locator('#consentNo').boundingBox(), page.locator('#consentYes').boundingBox()]);
  expect(Math.abs(no.height - yes.height)).toBeLessThan(2);
  expect(await page.locator('#consentNo').getAttribute('class')).toBe(await page.locator('#consentYes').getAttribute('class'));
  expect(gcRequests(page)).toEqual([]);
  await page.click('#consentYes');
  await expect.poll(() => gcRequests(page).length).toBeGreaterThan(0);
});

test('caricamento a freddo: nessuna richiesta a Google Fonts né ad altri host prima del consenso', async ({ page }) => {
  await setup(page);
  await page.waitForTimeout(800);
  expect(external(page)).toEqual([]);
  expect(page.requests.filter((u) => /fonts\.g(oogleapis|static)\.com/.test(u))).toEqual([]);
  // i caratteri Barlow ora vengono dall'app stessa
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family); });
  expect(fonts.join(',')).toContain('Barlow');
});

test('Content-Security-Policy: presente, restrittiva e senza violazioni usando l\'app', async ({ page }) => {
  await setup(page, { answer: '0' });
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(csp).not.toMatch(/fonts\.g/);
  await page.click('#openSettings');
  await page.click('[data-close="settingsSheet"]');
  await page.click('#startStop');
  await page.waitForTimeout(500);
  // le uniche origini esterne ammesse funzionano; le altre no
  const res = await page.evaluate(async () => {
    const load = (tag, attrs) => new Promise((resolve) => {
      const el = document.createElement(tag); Object.assign(el, attrs); el.onload = () => resolve('ok'); el.onerror = () => resolve('err'); document.body.append(el);
      setTimeout(() => resolve('timeout'), 1500);
    });
    await load('script', { src: 'https://www.youtube.com/iframe_api' });
    await load('iframe', { src: 'https://www.youtube.com/embed/aaaaaaaaaaa' });
    const before = window.__csp.length;
    await load('script', { src: 'https://evil.example/x.js' });
    await load('iframe', { src: 'https://evil.example/' });
    await fetch('https://evil.example/').catch(() => {});
    return { ok: window.__csp.slice(0, before), blocked: window.__csp.slice(before) };
  });
  expect(res.ok).toEqual([]);
  expect(res.blocked.length).toBeGreaterThanOrEqual(2); // script e iframe estranei
  expect(page.errors).toEqual([]);
});

test.describe('avviso di sicurezza', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('compare una volta sola, prima della prima uscita', async ({ page }) => {
    await setup(page, { answer: '0' });
    await expect(page.locator('#safetySheet')).toBeHidden();
    await page.click('#startStop');
    await expect(page.locator('#safetySheet')).toBeVisible();
    await expect(page.locator('#safetySheet')).toContainText('Exercise carries some risk');
    expect(await page.evaluate(() => document.body.classList.contains('riding'))).toBe(false);
    await page.click('#safetyOk');
    await expect(page.locator('#safetySheet')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/riding/);
    expect(await page.evaluate(() => localStorage.getItem('safetyAck'))).toBe('1');
    await page.reload();
    await page.click('#startStop');
    await expect(page.locator('#safetySheet')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/riding/);
  });
});

test('Impostazioni: voce "Open-source licences" verso la pagina delle licenze del sito; consenso modificabile', async ({ page }) => {
  await setup(page, { answer: '0' });
  await page.click('#openSettings');
  const a = page.locator('#openLicences');
  await expect(a).toContainText('Open-source licences');
  expect(await a.getAttribute('href')).toBe('https://spindro.fun/licenses/');
  await expect(page.locator('#analyticsOn')).not.toBeChecked();
  await expect(page.locator('a[data-legal="privacy"]')).toHaveAttribute('href', 'https://spindro.fun/privacy/');
});

test('avviso e licenze esistono in tutte e cinque le lingue', async () => {
  for (const l of ['en', 'it', 'fr', 'es', 'de']) {
    const d = JSON.parse(readFileSync(`${ROOT}locales/${l}.json`, 'utf8'));
    for (const k of ['safety.title', 'safety.body', 'safety.ok', 'legal.licenses', 'video.ytTerms']) expect(d[k], `${l}:${k}`).toBeTruthy();
  }
});

test('ogni file di ASSETS in sw.js esiste', async () => {
  const sw = readFileSync(`${ROOT}sw.js`, 'utf8');
  const list = [...sw.match(/const ASSETS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
  const missing = list.filter((p) => { try { readFileSync(`${ROOT}${p}`); return false; } catch { return true; } });
  expect(missing).toEqual([]);
});

test('sito: CSP in ogni pagina, nessun Google Fonts, link legali ovunque', async () => {
  execSync('node site/build.mjs', { cwd: ROOT, stdio: 'pipe' });
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const pages = walk(`${ROOT}site/dist`).filter((f) => f.endsWith('.html'));
  expect(pages.length).toBeGreaterThan(8);
  for (const f of pages) {
    const h = readFileSync(f, 'utf8');
    expect(h, f).toContain('Content-Security-Policy');
    expect(h, f).not.toMatch(/fonts\.g(oogleapis|static)\.com/);
    if (f.endsWith('404.html')) continue;
    for (const slug of ['privacy', 'terms', 'licenses', 'trademarks']) expect(h, `${f} → ${slug}`).toMatch(new RegExp(`href="/(it/)?${slug}/"`));
    expect(h, f).toContain('github.com/C1aud1o/Spindro');
  }
});

// I modelli 3D hanno le texture dentro il file: il caricatore le apre come blob:. Una CSP senza blob: in connect-src li lascia
// senza texture (personaggi bianchi o neri) senza far fallire nient'altro: questo test lo impedisce, per tutti i giochi.
for (const game of ['racer', 'horde', 'shooter', 'gruppetto', 'planata', 'mattoni']) {
  test(`CSP: ${game} loads its 3D models and textures with no violation`, async ({ page }) => {
    test.setTimeout(150_000);
    const violations = []; const bad = [];
    page.on('console', (m) => { const s = m.text(); if (/Content Security Policy/i.test(s)) violations.push(s.slice(0, 160)); if (/Couldn't load texture|GLTFLoader.*(error|fail)/i.test(s)) bad.push(s.slice(0, 160)); });
    await page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('gameQuality', 'low'); } catch { /* */ } });
    await page.addInitScript({ path: FAKE_BLE });
    await page.goto('/index.html');
    await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
    await page.click('#openGame');
    await page.click(`[data-game=${game}]`);
    await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).not.toBe('loading');
    await page.waitForTimeout(1500);
    expect(violations, 'Content-Security-Policy violations').toEqual([]);
    expect(bad, 'textures that failed to load').toEqual([]);
  });
}
