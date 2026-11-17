// Compone le immagini finali per gli store a partire dalle catture di store-shots.mjs:
//   store/screenshots/<lingua>/01.png … 08.png   1080×1920, didascalia in alto + telefono
//   store/feature-graphics/<lingua>.png          1024×500 (Play), in più store/feature-graphic.png (inglese): icona, wordmark,
//                                                una riga e una schermata vera da site/assets/shots/home-<lingua>.webp
//   (store/icon-512.png lo scrive scripts/icons.mjs, dallo stesso SVG di tutte le icone)
// Tutto è disegnato con il canvas di Chromium: nessuna dipendenza nuova. Colori e font vengono da css/style.css
// (--ink, --surface, --accent, Barlow Condensed). Le immagini sono PROVVISORIE: il proprietario potrà rifarle.
//
//   node scripts/store-shots.mjs && node scripts/store-frames.mjs [en it …]
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright', '@playwright/test', '/opt/node-tools/node_modules/playwright']) {
    try { return require(name); } catch { /* prova la prossima */ }
  }
  throw new Error('Playwright non trovato');
}
const { chromium } = loadPlaywright();

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RAW = join(ROOT, 'store/raw');
const SHOTS_OUT = join(ROOT, 'store/screenshots');
const ALL_LANGS = ['en', 'it', 'fr', 'es', 'de'];
const args = process.argv.slice(2).filter((a) => ALL_LANGS.includes(a));
const LANGS = args.length ? args : ALL_LANGS;
const CHROMIUM = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// palette letta da css/style.css, così le immagini seguono l'app se i colori cambiano
const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
const tok = (name, fallback) => (css.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1]?.trim() || fallback;
const PAL = { ink: tok('ink', '#0f0f0d'), surface: tok('surface', '#1a1a17'), surface2: tok('surface-2', '#23231f'), accent: tok('accent', '#d9ff3d'), accentInk: tok('accent-ink', '#141a00'), paper: '#f1ece2' };

// didascalie (≤ 40 caratteri). Le 1, 2, 4, 6 vengono da docs/launch/play-store.md ("Didascalie per gli 8 screenshot");
// le 3, 5, 7 e 8 descrivono schermate che la tabella non prevede (editor, video, fine uscita, storico).
const CAPTIONS = {
  en: ['Connect your smart trainer', 'Structured ERG workouts', 'Build your own workouts', 'Race a 3D stage on pedal power', 'Ride along your own video', 'Your watch records the ride', 'Medals for every record', 'History and power records'],
  it: ['Collega il tuo rullo smart', 'Allenamenti ERG strutturati', 'Crea i tuoi allenamenti', 'Una tappa 3D a forza di pedali', 'Pedala sul tuo video', "L'orologio registra l'uscita", 'Medaglie per ogni record', 'Storico e record di potenza'],
  fr: ['Connectez votre home trainer', 'Séances ERG structurées', 'Créez vos propres séances', 'Une étape 3D à la force des jambes', 'Pédalez sur votre propre vidéo', 'Votre montre enregistre', 'Une médaille pour chaque record', 'Historique et records de puissance'],
  es: ['Conecta tu rodillo inteligente', 'Entrenos ERG estructurados', 'Crea tus propios entrenos', 'Una etapa 3D a pedales', 'Pedalea sobre tu propio vídeo', 'Tu reloj graba la salida', 'Una medalla por cada récord', 'Historial y récords de potencia'],
  de: ['Smart Trainer verbinden', 'Strukturierte ERG-Workouts', 'Eigene Workouts erstellen', '3D-Etappe mit Pedalkraft', 'Fahre zu deinem eigenen Video', 'Deine Uhr zeichnet auf', 'Medaillen für jeden Rekord', 'Verlauf und Leistungsrekorde'],
};
// una riga per l'immagine in evidenza (come sul sito: "Your trainer. No subscription.")
const TAGLINES = {
  en: 'Your trainer. No subscription.', it: 'Il tuo rullo. Nessun abbonamento.', fr: 'Votre home trainer. Sans abonnement.',
  es: 'Tu rodillo. Sin suscripción.', de: 'Dein Trainer. Kein Abo.',
};

// tutto il disegno gira nel browser: questa funzione viene serializzata ed eseguita nella pagina
function pageDraw() {
  const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const glow = (g, W, H, pal, cx, cy, rad, a) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(217,255,61,${a})`); gr.addColorStop(1, 'rgba(217,255,61,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  };
  const background = (g, W, H, pal, a = 0.16) => { g.fillStyle = pal.ink; g.fillRect(0, 0, W, H); glow(g, W, H, pal, W * 0.5, -H * 0.05, Math.max(W, H) * 0.8, a); };

  // parola "Spindro" come nell'intestazione dell'app: corsivo maiuscolo, "Spin" chiaro e "dro" nel colore d'accento
  const wordmark = (g, pal, x, y, size, align = 'left') => {
    g.font = `italic 700 ${size}px ${FONT}`; g.textBaseline = 'alphabetic';
    const a = 'SPIN'; const b = 'DRO'; const ls = size * 0.01;
    const wa = g.measureText(a).width + ls * a.length; const wb = g.measureText(b).width + ls * b.length;
    let x0 = x; if (align === 'center') x0 = x - (wa + wb) / 2; else if (align === 'right') x0 = x - (wa + wb);
    g.textAlign = 'left'; g.letterSpacing = `${ls}px`;
    g.fillStyle = pal.paper; g.fillText(a, x0, y); g.fillStyle = pal.accent; g.fillText(b, x0 + wa, y); g.letterSpacing = '0px';
    return wa + wb;
  };

  // porta il testo a capo; restituisce le righe
  const wrap = (g, text, maxW) => {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur); return lines;
  };

  const phone = (g, img, x, y, w, h, radius, pal) => {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
    rr(g, x - 7, y - 7, w + 14, h + 14, radius + 7); g.fillStyle = '#34342f'; g.fill(); g.restore();
    rr(g, x - 3, y - 3, w + 6, h + 6, radius + 3); g.fillStyle = '#0a0a09'; g.fill();
    g.save(); rr(g, x, y, w, h, radius); g.clip(); g.drawImage(img, x, y, w, h); g.restore();
  };

  return {
    // schermata store 1080×1920
    screenshot(canvas, img, caption, pal) {
      const W = 1080; const H = 1920; canvas.width = W; canvas.height = H; const g = canvas.getContext('2d');
      background(g, W, H, pal);
      // fascia d'accento + didascalia grande, al massimo 2 righe
      g.fillStyle = pal.accent; rr(g, 72, 84, 96, 12, 6); g.fill();
      const text = caption.toUpperCase(); let size = 150; let lines;
      for (; size >= 84; size -= 4) { g.font = `700 ${size}px ${FONT}`; lines = wrap(g, text, W - 144); if (lines.length <= 2) break; }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = pal.paper; g.font = `700 ${size}px ${FONT}`;
      lines.forEach((l, i) => g.fillText(l, 72, 118 + size * 0.84 + i * size * 0.98));
      // telefono: tutta la cattura, centrata sotto la didascalia
      const top = 420; const h = H - top - 56; const w = Math.round(h * (img.width / img.height));
      phone(g, img, Math.round((W - w) / 2), top, w, h, 70, pal);
    },

    // immagine in evidenza Play 1024×500: icona, wordmark, una riga, una schermata vera che esce dal bordo inferiore
    feature(canvas, imgs, tagline, pal) {
      const W = 1024; const H = 500; canvas.width = W; canvas.height = H; const g = canvas.getContext('2d');
      background(g, W, H, pal, 0.2);
      glow(g, W, H, pal, W * 0.82, H * 0.5, 380, 0.1);
      const [icon, shot] = imgs;
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 30; g.shadowOffsetY = 10; rr(g, 72, 66, 128, 128, 30); g.fillStyle = pal.ink; g.fill(); g.restore();
      g.save(); rr(g, 72, 66, 128, 128, 30); g.clip(); g.drawImage(icon, 72, 66, 128, 128); g.restore();
      rr(g, 73, 67, 126, 126, 29); g.strokeStyle = 'rgba(242,240,230,.14)'; g.lineWidth = 2; g.stroke();
      wordmark(g, pal, 66, 342, 150);
      g.fillStyle = pal.accent; rr(g, 72, 366, 88, 8, 4); g.fill();
      let size = 42; g.font = `600 ${size}px ${FONT}`; const text = tagline.toUpperCase();
      while (g.measureText(text).width > 590 && size > 24) { size -= 1; g.font = `600 ${size}px ${FONT}`; }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = pal.paper; g.fillText(text, 72, 424);
      const pw = 252; const ph = Math.round(pw * shot.height / shot.width);
      phone(g, shot, 700, 58, pw, ph, 28, pal);
    },
  };
}

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
const page = await browser.newPage();
const font64 = (f) => readFileSync(join(ROOT, 'assets/fonts', f)).toString('base64');
const faces = [['600', 'normal', 'barlow-condensed-latin-600-normal.woff2'], ['700', 'normal', 'barlow-condensed-latin-700-normal.woff2'], ['700', 'italic', 'barlow-condensed-latin-700-italic.woff2']]
  .map(([w, st, f]) => `@font-face{font-family:"Barlow Condensed";font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${font64(f)})}`).join('');
await page.setContent(`<!doctype html><meta charset="utf-8"><style>${faces}</style><canvas id="c"></canvas>`);
await page.evaluate(async () => {
  await Promise.all(['700 100px "Barlow Condensed"', 'italic 700 100px "Barlow Condensed"', '600 100px "Barlow Condensed"'].map((f) => document.fonts.load(f)));
});
const fontOk = await page.evaluate(() => document.fonts.check('700 100px "Barlow Condensed"') && [...document.fonts].some((f) => f.family.includes('Barlow') && f.status === 'loaded'));
if (!fontOk) console.warn('! Barlow Condensed non caricato: le immagini useranno un font di ripiego.');
await page.evaluate(`window.__draw = (${pageDraw.toString()})()`);

const MIME = { png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const dataUrl = (file) => `data:${MIME[file.split('.').pop()]};base64,${readFileSync(file).toString('base64')}`;
async function render(kind, payload) {
  const url = await page.evaluate(async ({ kind, payload, pal }) => {
    const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
    const c = document.getElementById('c'); const d = window.__draw;
    if (kind === 'screenshot') d.screenshot(c, await load(payload.img), payload.caption, pal);
    else d.feature(c, [await load(payload.imgs[0]), await load(payload.imgs[1])], payload.tagline, pal);
    return c.toDataURL('image/png');
  }, { kind, payload, pal: PAL });
  return Buffer.from(url.split(',')[1], 'base64');
}

let missing = 0;
for (const lang of LANGS) {
  mkdirSync(join(SHOTS_OUT, lang), { recursive: true });
  for (let n = 1; n <= 8; n++) {
    const raw = join(RAW, lang, `${String(n).padStart(2, '0')}.png`);
    if (!existsSync(raw)) { console.warn(`manca ${raw}`); missing++; continue; }
    writeFileSync(join(SHOTS_OUT, lang, `${String(n).padStart(2, '0')}.png`), await render('screenshot', { img: dataUrl(raw), caption: CAPTIONS[lang][n - 1] }));
  }
  const shot = join(ROOT, 'site/assets/shots', `home-${lang}.webp`);
  if (existsSync(shot)) {
    mkdirSync(join(ROOT, 'store/feature-graphics'), { recursive: true });
    writeFileSync(join(ROOT, 'store/feature-graphics', `${lang}.png`), await render('feature', { imgs: [dataUrl(join(ROOT, 'icons/icon.svg')), dataUrl(shot)], tagline: TAGLINES[lang] }));
  } else { console.warn(`manca ${shot}: SHOT_LANG=${lang} SHOT_ONLY=home node scripts/site-shots.mjs`); missing++; }
  console.log(`ok  ${lang}`);
}
if (existsSync(join(ROOT, 'store/feature-graphics/en.png'))) copyFileSync(join(ROOT, 'store/feature-graphics/en.png'), join(ROOT, 'store/feature-graphic.png'));
await browser.close();
process.exit(missing ? 1 : 0);
