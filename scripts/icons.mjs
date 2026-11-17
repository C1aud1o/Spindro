// Draws every icon of the project from ONE source, icons/icon.svg (a rounded-square background `#bg` and the mark `#mark`).
// Re-run it after editing the SVG:   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/icons.mjs
// Writes: icons/*.png (PWA any + maskable, apple-touch, shortcuts), site/assets/favicon.svg, store/icon-512.png and the
// Android launcher set under android/app/src/main/res (legacy + round mipmaps, adaptive foreground, monochrome layer, splash).
// Also writes the adaptive-icon background colour to values/colors.xml. The mark is measured from its pixels and centred
// optically, then scaled so its farthest point stays inside the safe circle of each target (circle and squircle masks never cut it).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = readFileSync('icons/icon.svg', 'utf8');
const BG = SRC.match(/id="bg"[^>]*fill="([^"]+)"/)[1];
const MARK = SRC.match(/<g id="mark"[\s\S]*?<\/g>/)[0];
const LIME = MARK.match(/stroke="([^"]+)"/)[1];
const PAPER = '#F2F0E6';

const open = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>`;
const recolor = (m, from, to) => m.split(from).join(to);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();

// ---- measure the mark: centre of its bounding box and radius of its farthest pixel from that centre ----
const m = await page.evaluate(async (svg) => {
  const img = new Image(); img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 512, 512);
  const d = g.getImageData(0, 0, 512, 512).data; let x0 = 512, y0 = 512, x1 = 0, y1 = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (d[(y * 512 + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2; let R = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (d[(y * 512 + x) * 4 + 3] > 40) R = Math.max(R, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  return { cx, cy, R };
}, open(MARK));
// the mark centred in the canvas, its farthest point at distance r (in 512 units) from the centre
const placed = (r, mark = MARK) => `<g transform="translate(256 256) scale(${(r / m.R).toFixed(4)}) translate(${-m.cx} ${-m.cy})">${mark}</g>`;

const out = [];
const add = (path, w, h, markup) => out.push({ path, w, h, markup });
const square = (fill) => `<rect width="512" height="512" fill="${fill}"/>`;
const rounded = (fill) => `<rect width="512" height="512" rx="112" fill="${fill}"/>`;
const mono = recolor(MARK, LIME, '#000');
const inverse = recolor(MARK, LIME, BG);
const MARK_R = 150;   // 512-unit radius of the mark on a plain icon (fits the 66 % safe circle, r = 169)

// ---- web ----
for (const s of [192, 512]) {
  add(`icons/icon-${s}.png`, s, s, open(rounded(BG) + placed(MARK_R)));
  add(`icons/icon-maskable-${s}.png`, s, s, open(square(BG) + placed(MARK_R))); // full bleed; the mark stays inside the central 66 %
}
add('icons/apple-touch-icon.png', 180, 180, open(square(BG) + placed(MARK_R + 14))); // iOS applies its own corner radius
add('icons/shortcut-workouts.png', 96, 96, open(square(BG) + placed(MARK_R + 14)));
add('icons/shortcut-games.png', 96, 96, open(square(LIME) + placed(MARK_R + 14, inverse))); // same mark, inverted: tells the two shortcuts apart
add('store/icon-512.png', 512, 512, open(square(BG) + placed(MARK_R + 10))); // Google Play applies the mask itself

// ---- Android ----
const res = 'android/app/src/main/res';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// adaptive layers are 108 dp, the visible window 72 dp, the always-safe circle 66 dp: radius 33/108 of the side
const SAFE = (33 / 108) * 512;
for (const [d, k] of Object.entries(dens)) {
  const dir = `${res}/mipmap-${d}`; const px = Math.round(48 * k); const fg = Math.round(108 * k);
  add(`${dir}/ic_launcher.png`, px, px, open(rounded(BG) + placed(MARK_R + 10)));
  add(`${dir}/ic_launcher_round.png`, px, px, open(`<circle cx="256" cy="256" r="256" fill="${BG}"/>` + placed(MARK_R)));
  add(`${dir}/ic_launcher_foreground.png`, fg, fg, open(placed(SAFE * 0.96)));
  add(`${dir}/ic_launcher_monochrome.png`, fg, fg, open(placed(SAFE * 0.96, mono))); // themed icons: one tint, transparency is the shape
}
const SPLASH = { drawable: [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920] };
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  const k = (Math.min(w, h) * 0.17) / m.R; // mark radius = 17 % of the short side
  add(`${res}/${dir}/splash.png`, w, h, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/><g transform="translate(${w / 2} ${h / 2}) scale(${k.toFixed(4)}) translate(${-m.cx} ${-m.cy})">${MARK}</g></svg>`);
}
add(`${res}/drawable-nodpi/splash_icon.png`, 432, 432, open(placed((33 / 108) * 512 * 0.9))); // Android 12 splash crops it to a circle of 2/3

// ---- rasterise ----
for (const o of out) {
  await page.setViewportSize({ width: o.w, height: o.h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${o.w}px;height:${o.h}px}</style>${o.markup}`);
  mkdirSync(o.path.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(o.path, await page.screenshot({ omitBackground: true, type: 'png' }));
}
await browser.close();

// ---- vector and colour files ----
writeFileSync('site/assets/favicon.svg', SRC.replace(/<title>.*?<\/title>/, '').replace(' viewBox="0 0 512 512"', ' viewBox="0 0 512 512"'));
const colors = readFileSync(`${res}/values/colors.xml`, 'utf8').replace(/(<color name="ic_launcher_background">)[^<]*/, `$1${BG}`);
writeFileSync(`${res}/values/colors.xml`, colors);
console.log(`${out.length} PNG written; mark radius ${m.R.toFixed(1)}, centre ${m.cx}, ${m.cy}`);
