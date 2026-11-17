#!/usr/bin/env node
// Genera site/assets/og.png (1200x630) nello stile del sito: carta avorio, titolo con evidenziatore lime,
// wordmark e lo screenshot vero dell'app inclinato con il bollino "0 € per month".
//   node site/make-og.mjs
import { chromium, launchOptions } from './pw.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
// font e immagine incorporati in base64: con setContent la pagina (about:blank) non può leggere file://
const b64 = (f, mime) => `data:${mime};base64,${readFileSync(join(here, f)).toString('base64')}`;
const font = (f) => b64(`assets/fonts/${f}`, 'font/woff2');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:BC;font-weight:700;font-style:italic;src:url("${font('barlow-condensed-latin-700-italic.woff2')}")}
@font-face{font-family:B;font-weight:700;src:url("${font('barlow-latin-700-normal.woff2')}")}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#f1efe6;color:#131311;position:relative;overflow:hidden;font-family:B,sans-serif}
.ic{position:absolute;left:70px;top:44px;width:72px;height:72px;border-radius:17px}
.wm{position:absolute;left:162px;top:52px;font:italic 700 56px/1 BC,sans-serif;text-transform:uppercase}
.wm b{background:#d9ff3d;padding:0 8px;margin-left:2px}
h1{position:absolute;left:70px;top:200px;font:italic 700 80px/1 BC,sans-serif;text-transform:uppercase;white-space:nowrap}
h1 mark{background:#d9ff3d;color:#131311;padding:0 14px;margin-left:-14px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.k{position:absolute;left:70px;bottom:52px;font:700 22px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#5d5c53}
.phone{position:absolute;right:60px;top:56px;width:250px;height:500px;border:4px solid #131311;border-radius:34px;overflow:hidden;transform:rotate(7deg);box-shadow:12px 14px 0 #131311;background:#131311}
.phone.b{right:330px;top:96px;transform:rotate(-5deg);width:230px;height:460px}
.phone img{width:100%;height:100%;object-fit:cover;display:block}
.st{position:absolute;right:490px;top:430px;width:150px;height:150px;border-radius:50%;background:#d9ff3d;border:3px solid #131311;box-shadow:6px 7px 0 #131311;transform:rotate(-12deg);display:grid;place-content:center;text-align:center}
.st b{font:italic 700 62px/.85 BC,sans-serif;display:block}
.st span{font:700 17px/1.1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;display:block;margin-top:6px}
</style>
<img class="ic" src="${b64('../icons/icon.svg', 'image/svg+xml')}">
<div class="wm">Spin<b>dro</b></div>
<h1>Your trainer.<br><mark>No subscription.</mark></h1>
<div class="k">Free · Open source</div>
<div class="phone b"><img src="${b64('assets/shots/home-en.webp', 'image/webp')}"></div>
<div class="phone"><img src="${b64('assets/shots/game-racer-en.webp', 'image/webp')}"></div>
<div class="st"><b>0 €</b><span>per month</span></div>`;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, 'assets/og.png') });
await browser.close();
console.log('site/assets/og.png creato');
