// Report dell'ultimo arresto anomalo e cattura degli errori JS (js/crashreport.js), con un plugin nativo finto.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); } } catch { /* */ } });
  page.on('pageerror', () => {}); // qui gli errori li provochiamo noi
  await page.goto('/index.html');
  await page.waitForFunction(() => window.rfDevices);
});

const REPORT = 'Spindro crash report\nThread: CapacitorPlugins\nDevice: Test Phone\njava.lang.SecurityException: boom';
const show = (page, report = REPORT) => page.evaluate(async (rep) => {
  const m = await import('/js/crashreport.js');
  window.__cleared = 0; window.__shared = null;
  const plugin = { getCrashReport: async () => ({ report: rep }), clearCrashReport: async () => { window.__cleared++; }, shareFile: async (a) => { window.__shared = a; } };
  return !!(await m.checkNativeCrash({ plugin }));
}, report);

test('con un report in sospeso compare il messaggio con testo, Copia e Condividi; Chiudi cancella il report', async ({ page }) => {
  expect(await show(page)).toBe(true);
  const dlg = page.locator('.crash-dlg');
  await expect(dlg).toContainText('Spindro closed unexpectedly last time');
  await expect(dlg.locator('textarea')).toHaveValue(/java\.lang\.SecurityException: boom/);

  await dlg.locator('[data-copy]').click();
  await expect(dlg.locator('.crash-note')).toHaveText('Copied to the clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Thread: CapacitorPlugins');

  await dlg.locator('[data-share]').click();
  await expect.poll(() => page.evaluate(() => window.__shared?.mime)).toBe('text/plain');
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.mode).toBe('send');
  expect(Buffer.from(shared.data, 'base64').toString('utf8')).toContain('java.lang.SecurityException: boom');

  expect(await page.evaluate(() => window.__cleared)).toBe(0); // finché la finestra è aperta il report resta sul telefono
  await dlg.locator('[data-close]').click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => window.__cleared)).toBe(1);
});

test('senza report non compare nulla (e un plugin che fallisce non rompe l\'avvio)', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const m = await import('/js/crashreport.js');
    const a = await m.checkNativeCrash({ plugin: { getCrashReport: async () => ({ report: null }) } });
    const b = await m.checkNativeCrash({ plugin: { getCrashReport: async () => { throw new Error('UNIMPLEMENTED'); } } });
    const c = await m.checkNativeCrash({ plugin: null });
    return [a, b, c];
  })).toEqual([null, null, null]);
  await expect(page.locator('.crash-dlg')).toHaveCount(0);
});

test('errori ed eccezioni non gestite finiscono nel registro dell\'app e nel diario salvato', async ({ page }) => {
  await page.evaluate(() => {
    setTimeout(() => { Promise.reject(new Error('boom-connect-rejection')); }, 0);
    setTimeout(() => { throw new Error('boom-sync-error'); }, 10);
  });
  await expect.poll(() => page.evaluate(() => document.getElementById('log').textContent)).toMatch(/unhandledrejection.*boom-connect-rejection/);
  await expect.poll(() => page.evaluate(() => document.getElementById('log').textContent)).toMatch(/JS error.*boom-sync-error/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('diagLog') || '')).toContain('boom-connect-rejection');
});

test('"Copia diagnostica" mette diario e registro negli appunti', async ({ page }) => {
  await page.evaluate(async () => { (await import('/js/crashreport.js')).record('BLE · connect AA:BB (prova)'); });
  await page.evaluate(() => { document.getElementById('copyDiag').click(); });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('BLE · connect AA:BB (prova)');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Spindro diagnostics');
});

test('WebView Android senza ponte Capacitor: lo dice nel diario', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const m = await import('/js/crashreport.js');
    const ok = m.checkBridge({ ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', native: false });
    const fine = m.checkBridge({ ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120 Mobile', native: false });
    return { ok, fine, diary: m.diaryText() };
  });
  expect(out.ok).toBe(false);
  expect(out.fine).toBe(true);
  expect(out.diary).toContain('WebView senza ponte Capacitor');
});
