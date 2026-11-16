// Shared helpers for the QA exploration scripts (scripts/qa/*). Run a static server first: `node tests/serve.mjs`.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const FAKE_BLE = fileURLToPath(new URL('../../tests/fake-ble.js', import.meta.url));
export const BASE = process.env.QA_BASE || 'http://127.0.0.1:4180';
export const OUT = process.env.QA_OUT || '/tmp/qa-shots';
export const VIEWPORTS = { s360: [360, 640], s390: [390, 780], s412: [412, 915], t768: [768, 1024], d1280: [1280, 720] };
export const LANGS = ['it', 'en', 'de', 'fr', 'es'];

export async function launch() {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
}

/** New page with seeded storage, fake BLE and console/CSP/pageerror collection in page.qaLog. */
export async function newPage(browser, { vp = 's390', lang = 'en', seed = {}, ble = true, base = BASE, path = '/index.html', clock = false } = {}) {
  const [width, height] = VIEWPORTS[vp] || vp;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.qaLog = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.qaLog.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => page.qaLog.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.qaLog.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) page.qaLog.push(`http ${r.status()}: ${r.url()}`); });
  const s = { safetyAck: '1', analytics: '0', lang, ...seed };
  await page.addInitScript((s) => { try { if (!localStorage.getItem('__qa')) { localStorage.setItem('__qa', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } } catch { /* */ } }, s);
  if (ble) await page.addInitScript({ path: FAKE_BLE });
  if (clock) await page.clock.install(); // fake timers, installed before the app starts
  await page.goto(base + path);
  await page.waitForSelector('html.ready', { state: 'attached' });
  await page.waitForTimeout(400);
  return page;
}

export const connectTrainer = (page) => page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
export const connectClick = (page) => page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); window.__fakeBle.next = 'click'; await window.rfDevices.add(); });

export function shot(page, ...parts) {
  const name = parts.join('_');
  mkdirSync(OUT, { recursive: true });
  return page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

/** DOM audit: horizontal overflow, clipped text, small tap targets, raw keys, NaN/undefined. Returns list of strings. */
export function audit(page, label = '') {
  return page.evaluate((label) => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = el; p; p = p.parentElement) { if (p.hidden) return false; const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
    const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`${label} page scrolls horizontally: ${document.documentElement.scrollWidth} > ${vw}`);
    // only the top layer is audited: an open sheet/dialog hides what is behind it
    const layers = [...document.querySelectorAll('.sheet:not([hidden]) .sheet-body, .calib:not([hidden]), #gamePanel:not([hidden])')];
    const root = layers.length ? layers[layers.length - 1] : document.body;
    for (const el of root.querySelectorAll('*')) {
      if (!vis(el)) continue;
      // scrollable layers (sheets) and canvases excluded
      const r = el.getBoundingClientRect();
      if (el.closest('#gamePanel,#debugPanel')) continue;
      if (r.right > vw + 1 || r.left < -1) { if (!el.closest('.cassette,[data-scroll],.chips')) out.push(`${label} outside viewport x: ${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`); }
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') out.push(`${label} clipped text: ${desc(el)} "${el.textContent.trim().slice(0, 40)}" sw=${el.scrollWidth} cw=${el.clientWidth}`);
      if (hasText && cs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 1 && !['inline'].includes(cs.display)) out.push(`${label} text overflows box: ${desc(el)} "${el.textContent.trim().slice(0, 40)}" sw=${el.scrollWidth} cw=${el.clientWidth}`);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`${label} ellipsised (check intent): ${desc(el)} "${el.textContent.trim().slice(0, 40)}"`);
      if (['BUTTON', 'A', 'SELECT', 'INPUT', 'SUMMARY'].includes(el.tagName) || el.getAttribute('role') === 'button') {
        if (el.type === 'hidden' || el.type === 'file') continue;
        // links inside a running sentence are exempt (WCAG 2.5.8 inline exception)
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 8)) continue;
        if ((r.width < 44 || r.height < 44) && !(el.type === 'checkbox' || el.type === 'radio')) out.push(`${label} tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${desc(el)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
      }
    }
    const txt = document.body.innerText;
    const bad = txt.match(/\b(NaN|undefined|null|Infinity)\b|\b[a-z]+\.[a-z]+\.[a-zA-Z.]+\b|−0\b|\b-0\b(?![.\d])/g);
    if (bad) out.push(`${label} suspicious text: ${[...new Set(bad)].slice(0, 8).join(', ')}`);
    return out;
  }, label);
}
