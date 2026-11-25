// WCAG contrast of every visible text element against the WORST pixel behind it (ambient background and glass included).
// Method: render the page, hide all text (transparent), screenshot; for each text element sample the pixels of its box, composite the real text colour over
// each pixel and keep the lowest contrast ratio (5th percentile of the samples, so a stray anti-aliased pixel does not decide). AA: 4.5, large text: 3.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/u4-contrast.mjs --base=http://127.0.0.1:4173 [--out=docs/design/u4-contrast.md]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = opt('base', 'http://127.0.0.1:4173'); const OUT = opt('out', '');
const FAKE = new URL('../tests/fake-ble.js', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

// glass is measured at both ends of the ambient drift (the colour fields move: the worst case is whichever end puts the brightest field behind a text)
const MODES = { glass: {}, 'glass-drift-end': { drift: true }, solid: { solid: true }, contrast: { contrast: true } };
const STATES = {
  home: async () => {},
  dashboard: async (p) => { await p.locator('#openWorkouts').click(); await p.locator('[data-wk]').nth(2).click(); await p.waitForTimeout(600); const s = p.locator('#startStop'); if (/start/i.test(await s.textContent())) await s.click(); await p.waitForTimeout(3000); },
  settings: async (p) => { await p.locator('#openSettings').click(); await p.waitForTimeout(700); },
  workouts: async (p) => { await p.locator('#openWorkouts').click(); await p.waitForTimeout(700); },
  devices: async (p) => { await p.locator('#deviceBar').click(); await p.waitForTimeout(700); },
  history: async (p) => { await p.locator('#openHistoryCard').click(); await p.waitForTimeout(700); },
  clickmenu: async (p) => { await p.evaluate(async () => { window.__fakeBle.clickProto = 'v1'; window.__fakeBle.next = 'click'; return window.rfDevices.add(); }); await STATES.dashboard(p); await p.keyboard.press('m'); await p.waitForTimeout(600); },
  dialog: async (p) => { await STATES.dashboard(p); await p.evaluate(() => document.getElementById('finishRide')?.click()); await p.waitForTimeout(500); await p.evaluate(() => document.getElementById('reset')?.click()); await p.waitForTimeout(600); },
};
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 720 } };

async function measure(page) {
  const els = await page.evaluate(() => {
    const out = []; const vw = innerWidth; const vh = innerHeight;
    const hidden = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || n.hidden) return true; } return false; };
    for (const e of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CANVAS', 'INPUT', 'SELECT', 'OPTION', 'TEXTAREA'].includes(e.tagName.toUpperCase())) continue;
      const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
      if (!own || hidden(e) || e.closest('[inert]') || e.closest('[aria-hidden=true]')) continue;
      const det = e.closest('details:not([open])'); if (det && !e.closest('summary')) continue; // closed <details>: not shown
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      const rects = []; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { let [cx0, cy0, cx1, cy1] = [0, 0, vw, vh]; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(o.overflowY + o.overflowX)) { const ar = a.getBoundingClientRect(); cx0 = Math.max(cx0, ar.left); cy0 = Math.max(cy0, ar.top); cx1 = Math.min(cx1, ar.right); cy1 = Math.min(cy1, ar.bottom); } } /* only the part of the text inside its scroll container is visible */
          const qx0 = Math.max(cx0, q.left + 1); const qy0 = Math.max(cy0, q.top + 1); const qx1 = Math.min(cx1, q.right - 1); const qy1 = Math.min(cy1, q.bottom - 1); if (qx1 - qx0 >= 2 && qy1 - qy0 >= 2) { const t = document.elementFromPoint((qx0 + qx1) / 2, (qy0 + qy1) / 2); if (t && (e === t || e.contains(t) || t.contains(e))) rects.push([qx0, qy0, qx1, qy1]); } } }
      if (!rects.length) continue;
      const x0 = Math.max(0, r.left); const y0 = Math.max(0, r.top); const x1 = Math.min(vw, r.right); const y1 = Math.min(vh, r.bottom);
      if (x1 - x0 < 4 || y1 - y0 < 4 || +cs.opacity < 1 && +cs.opacity === 0) continue;
      // the element must really be the top one at its centre (not covered by a sheet or the scrim)
      const top = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2); if (!top || !(e === top || e.contains(top) || top.contains(e))) continue;
      const m = cs.color.match(/[\d.]+/g).map(Number); let eo = 1; for (let n = e; n; n = n.parentElement) eo *= +getComputedStyle(n).opacity;
      out.push({ rects, tag: e.tagName.toLowerCase(), cls: String(e.className || '').slice(0, 30), id: e.id, text: own.slice(0, 28), x0, y0, x1, y1, rgb: m.slice(0, 3), a: (m[3] ?? 1) * eo, fs: parseFloat(cs.fontSize), fw: +cs.fontWeight });
    }
    return out;
  });
  await page.addStyleTag({ content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}' });
  await page.waitForTimeout(250);
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ els, png }) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    return els.map((e) => {
      const rs = [];
      for (const [x0, y0, x1, y1] of e.rects) {
        const w = Math.max(1, Math.floor(x1 - x0)); const h = Math.max(1, Math.floor(y1 - y0)); const d = g.getImageData(Math.floor(x0), Math.floor(y0), w, h).data;
        for (let i = 0; i < d.length; i += 4 * 2) {
          const comp = [0, 1, 2].map((k) => e.a * e.rgb[k] + (1 - e.a) * d[i + k]); const l1 = L(...comp); const l2 = L(d[i], d[i + 1], d[i + 2]);
          rs.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
        }
      }
      rs.sort((a, b) => a - b); const ratio = rs[Math.floor(rs.length * 0.05)];
      const large = e.fs >= 24 || (e.fs >= 18.66 && e.fw >= 700);
      return { ...e, ratio: +ratio.toFixed(2), need: large ? 3 : 4.5 };
    });
  }, { els, png });
}

const ONLY_MODE = opt('modes', '').split(',').filter(Boolean); const ONLY_STATE = opt('states', '').split(',').filter(Boolean);
const rows = []; const worst = [];
for (const [vpName, vp] of Object.entries(VIEWPORTS)) for (const [mode, o] of Object.entries(MODES)) for (const [state, run] of Object.entries(STATES)) {
  if ((ONLY_MODE.length && !ONLY_MODE.includes(mode)) || (ONLY_STATE.length && !ONLY_STATE.includes(state))) continue;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript((o) => { localStorage.setItem('safetyAck', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('ftp', '200'); localStorage.setItem('__seeded', '1');
    localStorage.setItem('rideHistory', JSON.stringify([{ t: Date.now() - 864e5, dur: 3180, km: 24.1, avgW: 168, kj: 534, best: { 5: 262, 60: 231 } }])); localStorage.setItem('reduceGlass', o.solid ? '1' : '0'); }, o);
  await page.addInitScript({ path: FAKE });
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  if (o.contrast) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] }); }
  if (o.drift) await page.addStyleTag({ content: 'html::before{animation:none!important;transform:translate3d(2%,2%,0) scale(1.07)!important}html::after{animation:none!important;transform:translate3d(-3%,-2%,0) scale(.98)!important}' });
  await page.waitForTimeout(600);
  await run(page);
  const res = await measure(page);
  const fails = res.filter((r) => r.ratio < r.need);
  rows.push({ vp: vpName, mode, state, n: res.length, min: Math.min(...res.map((r) => r.ratio)), fails: fails.length });
  for (const f of fails) worst.push({ vp: vpName, mode, state, ...f });
  await ctx.close();
}
await browser.close();
const lines = ['# U5 liquid glass (bold): text contrast (WCAG AA)', '',
  'Every visible text element is checked against the worst pixel behind it (5th percentile of the sampled pixels), ambient background and glass included.',
  'Limit: 4.5:1, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold). Generated by `scripts/u4-contrast.mjs`.', '',
  '| viewport | mode | screen | text elements | lowest ratio | below AA |', '|---|---|---|---:|---:|---:|',
  ...rows.map((r) => `| ${r.vp} | ${r.mode} | ${r.state} | ${r.n} | ${r.min.toFixed(2)} | ${r.fails} |`), ''];
const uniq = new Map(); for (const w of worst) { const k = `${w.mode}|${w.tag}.${w.cls}|${w.text}`; if (!uniq.has(k) || uniq.get(k).ratio > w.ratio) uniq.set(k, w); }
if (uniq.size) { lines.push('## Below AA', '', '| mode | screen | element | text | colour | ratio | needs |', '|---|---|---|---|---|---:|---:|', ...[...uniq.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 40).map((w) => `| ${w.mode} (${w.vp}) | ${w.state} | ${w.tag}.${w.cls}${w.id ? '#' + w.id : ''} | ${w.text} | rgba(${w.rgb.join(',')},${w.a.toFixed(2)}) | ${w.ratio} | ${w.need} |`), ''); } else lines.push('No text below AA.', '');
const txt = lines.join('\n'); console.log(txt); if (OUT) writeFileSync(OUT, txt);
