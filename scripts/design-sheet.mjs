// Before/after contact sheet of the app icon and the store graphics -> docs/design/d2-icon.png (kept under 400 KB).
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/design-sheet.mjs [base-ref]     (base-ref defaults to `beta`: the "before" files come from git)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';

const REF = process.argv[2] || 'beta';
const git = (p) => execFileSync('git', ['show', `${REF}:${p}`], { maxBuffer: 1 << 26 });
const MIME = { png: 'image/png', svg: 'image/svg+xml' };
const uri = (buf, p) => `data:${MIME[p.split('.').pop()]};base64,${buf.toString('base64')}`;
const now = (p) => uri(readFileSync(p), p);
const old = (p) => uri(git(p), p);

// superellipse ("squircle") outline as a CSS clip path, objectBoundingBox units
const sq = (() => { const n = 5, pts = []; for (let i = 0; i < 160; i++) { const t = (i / 160) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t); pts.push([0.5 + 0.5 * Math.sign(c) * Math.abs(c) ** (2 / n), 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** (2 / n)]); } return 'M' + pts.map((p) => p.map((v) => v.toFixed(4)).join(' ')).join('L') + 'Z'; })();
const masked = (src, size) => `<img class="c" width="${size}" src="${src}"><img class="q" width="${size}" src="${src}">`;
const iconRow = (label, src) => `<div class="row"><b>${label}</b>${[48, 96, 256].map((s) => masked(src, s)).join('')}</div>`;
const LANGS = ['en', 'it', 'fr', 'es', 'de'];
const adaptive = `<div class="row"><b>Android adaptive</b>` + [['circle', 'c'], ['squircle', 'q'], ['rounded square', 'r']].map(([n, k]) =>
  `<div class="ad ${k}" style="background:#0F0F0D"><img width="144" src="${now('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')}"></div>`).join('') +
  `<div class="ad c" style="background:#2a2d1c"><img width="144" style="filter:brightness(0) invert(.88) sepia(.5) saturate(3) hue-rotate(20deg)" src="${now('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.png')}"></div>` +
  `<span>themed (monochrome)</span><img style="border-radius:10px" height="144" src="${now('android/app/src/main/res/drawable-port-xhdpi/splash.png')}"><span>splash</span></div>`;
const face = (w, st, f) => `@font-face{font-family:"Barlow Condensed";font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${readFileSync('assets/fonts/' + f).toString('base64')})}`;
const html = `<body><style>
${face(600, 'normal', 'barlow-condensed-latin-600-normal.woff2')}${face(700, 'italic', 'barlow-condensed-latin-700-italic.woff2')}
body{margin:0;width:1600px;background:#1b1b18;color:#F2F0E6;font:600 15px/1.2 "Barlow Condensed","Arial Narrow",sans-serif;padding:24px 28px;box-sizing:border-box}
h2{margin:18px 0 8px;font:italic 700 26px "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#D9FF3D}
.row{display:flex;align-items:center;gap:16px;margin:8px 0}.row b{width:112px;color:#a9a79c;text-transform:uppercase;letter-spacing:.06em}.row span{color:#a9a79c}
.c{border-radius:50%}.q{clip-path:url(#sq)}.r{border-radius:22%}img{display:block}.ad{width:144px;height:144px;overflow:hidden;flex:none}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.g img{width:100%;border-radius:6px}.g figcaption{margin:0 0 3px;color:#a9a79c;text-transform:uppercase}figure{margin:0}
</style><svg width="0" height="0"><defs><clipPath id="sq" clipPathUnits="objectBoundingBox"><path d="${sq}"/></clipPath></defs></svg>
<h2>Before: orange wheel</h2>${iconRow('48 / 96 / 256', old('icons/icon-512.png'))}
<h2>After: lime italic S (circle and squircle masks)</h2>${iconRow('48 / 96 / 256', now('icons/icon-512.png'))}${adaptive}
<h2>Play feature graphics (1024 x 500): before, then after in five languages</h2>
<div class="g"><figure><figcaption>before (en)</figcaption><img src="${old('store/feature-graphics/en.png')}"></figure>${LANGS.map((l) => `<figure><figcaption>${l}</figcaption><img src="${now(`store/feature-graphics/${l}.png`)}"></figure>`).join('')}</div></body>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(html); await page.evaluate(() => document.fonts.ready);
mkdirSync('docs/design', { recursive: true });
const png = '/tmp/d2-icon-full.png';
await page.screenshot({ path: png, fullPage: true }); await browser.close();
// palette PNG keeps the sheet small
execFileSync('convert', [png, '-colors', '160', '-define', 'png:compression-level=9', 'docs/design/d2-icon.png']);
console.log(`docs/design/d2-icon.png ${Math.round(statSync('docs/design/d2-icon.png').size / 1024)} KB`);
