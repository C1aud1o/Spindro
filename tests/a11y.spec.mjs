// Accessibilità: axe-core sulle schermate principali dell'app e sulle pagine del sito (WCAG 2.1 A/AA).
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function axe(page, label, opts = {}) {
  await page.evaluate(AXE);
  const res = await page.evaluate((o) => window.axe.run(document, { runOnly: { type: 'tag', values: o.tags }, ...(o.context ? {} : {}) }), { tags: TAGS });
  const bad = res.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect.soft(bad, `${label}\n${bad.join('\n')}`).toEqual([]);
}

async function openApp(page, lang = 'en') {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript((l) => { try { localStorage.setItem('lang', l); localStorage.setItem('analytics', '0'); } catch { /* */ } }, lang);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await expect(page.locator('#startStop')).toBeVisible();
}

for (const lang of ['en', 'it']) {
  test(`app (${lang}): home, impostazioni, allenamenti, dispositivi, uscita`, async ({ page }) => {
    await openApp(page, lang);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
    await axe(page, `home ${lang}`);
    await page.click('#openSettings'); await page.waitForTimeout(600); await axe(page, `settings ${lang}`);
    await page.click('[data-close="settingsSheet"]');
    await page.click('#openWorkouts'); await page.waitForTimeout(600); await axe(page, `workouts ${lang}`);
    await page.click('[data-close="workoutSheet"]');
    await page.evaluate(() => { document.getElementById('devicesSheet').hidden = false; }); await page.waitForTimeout(600); await axe(page, `devices ${lang}`);
    await page.evaluate(() => { document.getElementById('devicesSheet').hidden = true; });
    await page.click('#startStop'); await page.waitForTimeout(600); await axe(page, `ride ${lang}`);
  });
}

test('app: scheda del consenso e avviso di sicurezza', async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(() => { try { localStorage.setItem('lang', 'en'); localStorage.removeItem('analytics'); } catch { /* */ } });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await expect(page.locator('#consentSheet')).toBeVisible();
  await page.waitForTimeout(600); await axe(page, 'consent');
  await page.click('#consentNo');
  await page.evaluate(() => document.getElementById('safetySheet').hidden = false);
  await page.waitForTimeout(600); await axe(page, 'safety');
});

test('app: rispetta "riduci animazioni" e il focus è visibile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const dur = await page.evaluate(() => { const el = document.querySelector('.cta'); return getComputedStyle(el).transitionDuration; });
  expect(parseFloat(dur)).toBeLessThan(0.01);
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline).not.toBe('none');
});

test('contrasto: il lime #d9ff3d sullo scuro #0f0e0c supera 4,5:1', async () => {
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const [a, b] = [lum('#d9ff3d'), lum('#0f0e0c')];
  expect((a + 0.05) / (b + 0.05)).toBeGreaterThan(4.5);
});

test.describe('sito', () => {
  let server; let base;
  test.beforeAll(async () => {
    execSync('node site/build.mjs', { cwd: ROOT, stdio: 'pipe' });
    const dist = join(ROOT, 'site/dist');
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
    server = createServer((req, res) => {
      let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.afterAll(() => server.close());

  for (const path of ['/', '/it/', '/compatibility/', '/it/compatibility/', '/privacy/', '/it/terms/', '/licenses/', '/trademarks/']) {
    test(`axe ${path}`, async ({ page }) => {
      await page.route(/goatcounter|zgo\.at/, (r) => r.abort());
      await page.goto(base + path);
      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang).toBe(path.startsWith('/it') ? 'it' : 'en');
      await axe(page, path);
      // ogni pagina porta ai testi legali, al codice sorgente e a un contatto
      for (const slug of ['privacy', 'terms', 'licenses', 'trademarks']) await expect(page.locator(`footer a[href$="/${slug}/"]`)).toHaveCount(1);
      await expect(page.locator('footer a[href*="github.com/C1aud1o/Spindro"]').first()).toBeVisible();
      await expect(page.locator('footer a[href$="/issues"]')).toHaveCount(1);
    });
  }
});
