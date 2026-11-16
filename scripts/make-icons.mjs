// Disegna tutte le icone PNG (web e Android) da icons/icon.svg: stessi colori, stessa forma, nessun'altra grafica.
// Uso: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-icons.mjs
// Genera: icons/*.png (PWA, maskable, apple-touch) e android/app/src/main/res/{mipmap-*,drawable*}.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = '#0f1115', ORANGE = '#fc6719', HUB = '#eef1f6';
// la ruota (cerchio + raggi + mozzo) di icon.svg, centrata in (256,256), raggio massimo 200
const wheel = (ring = ORANGE, hub = HUB) =>
  `<circle cx="256" cy="256" r="150" fill="none" stroke="${ring}" stroke-width="36"/>` +
  `<g stroke="${ring}" stroke-width="28" stroke-linecap="round"><path d="M256 70v48M256 394v48M70 256h48M394 256h48M124 124l34 34M354 354l34 34M388 124l-34 34M158 354l-34 34"/></g>` +
  `<circle cx="256" cy="256" r="44" fill="${hub}"/>`;
const scaled = (s, inner) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">${inner}</g>`;
const svg = (inner, bg = '', clip = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}${clip ? `<g clip-path="url(#c)"><defs><clipPath id="c">${clip}</clipPath></defs>` : '<g>'}${inner}</g></svg>`;
const SQUARE = `<rect width="512" height="512" fill="${BG}"/>`;
const ROUNDED = `<rect width="512" height="512" rx="96" fill="${BG}"/>`;
const CIRCLE_BG = `<circle cx="256" cy="256" r="256" fill="${BG}"/>`;

const out = [];
const add = (path, size, markup) => out.push({ path, size, markup });

// ---- web ----
for (const s of [192, 512]) {
  add(`icons/icon-${s}.png`, s, svg(wheel(), ROUNDED));
  // maskable: sfondo a tutto campo, la ruota (raggio 200) ridotta a 0,8 -> 160 < 0,4*512 = 204,8 (zona sicura del cerchio)
  add(`icons/icon-maskable-${s}.png`, s, svg(scaled(0.8, wheel()), SQUARE));
}
add('icons/apple-touch-icon.png', 180, svg(scaled(0.88, wheel()), SQUARE)); // iOS arrotonda da solo
add('icons/shortcut-workouts.png', 96, svg(scaled(0.8, wheel()), SQUARE));

// ---- Android ----
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const res = 'android/app/src/main/res';
for (const [d, k] of Object.entries(dens)) {
  const dir = `${res}/mipmap-${d}`;
  add(`${dir}/ic_launcher.png`, Math.round(48 * k), svg(wheel(), ROUNDED));
  add(`${dir}/ic_launcher_round.png`, Math.round(48 * k), svg(wheel(), CIRCLE_BG));
  // adattivo: canvas 108dp, visibile 72dp, zona sicura = cerchio di 66dp -> raggio 33/108*512 = 156: la ruota (200) va a 0,76
  const fg = Math.round(108 * k);
  add(`${dir}/ic_launcher_foreground.png`, fg, svg(scaled(0.76, wheel())));
  // monocromatica (icone a tema Android 13): una sola tinta, la trasparenza fa la forma; il mozzo resta staccato dal cerchio
  add(`${dir}/ic_launcher_monochrome.png`, fg, svg(scaled(0.76, wheel('#000', '#000'))));
}
// splash: fondo del tema, ruota al centro (circa 1/4 del lato corto)
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.26 / 400; // la ruota è larga 400 unità
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#0f0f0d"/><g transform="translate(${w / 2} ${h / 2}) scale(${s}) translate(-256 -256)">${wheel()}</g></svg>`;
};
const SPLASH = { 'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920] };
for (const [dir, [w, h]] of Object.entries(SPLASH)) out.push({ path: `${res}/${dir}/splash.png`, w, h, markup: splash(w, h) });
// icona animata della splash di Android 12+ (il sistema la ritaglia in un cerchio di 2/3: ruota piccola e centrata)
add(`${res}/drawable-nodpi/splash_icon.png`, 432, svg(scaled(0.76, wheel())));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const o of out) {
  const w = o.w || o.size, h = o.h || o.size;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${o.markup}`);
  mkdirSync(o.path.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(o.path, await page.screenshot({ omitBackground: true, type: 'png' }));
}
await browser.close();
console.log(`${out.length} icone scritte`);
