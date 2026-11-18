#!/usr/bin/env node
// Generatore del sito vetrina Spindro: template + JSON di testi -> site/dist/. Nessuna dipendenza.
//   node site/build.mjs            costruisce site/dist/
//   node site/build.mjs --out dir  scrive altrove (per i test)
//   node site/build.mjs --config f usa un'altra configurazione (per i test)
// Per aggiungere una lingua: copia site/i18n/en.json in fr.json, traduci e aggiungi "fr" a "langs" in site/config.json.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(here, 'dist');

const read = (p) => readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const cfgArg = process.argv.indexOf('--config'); // --config file.json: un'altra configurazione (per i test)
const cfg = json(cfgArg > 0 ? resolve(process.argv[cfgArg + 1]) : join(here, 'config.json'));
// Senza account (FIREBASE_CONFIG nullo in js/config.js) la pagina «Elimina l'account» non ha senso: fuori da menu, pagine e sitemap (i file Markdown restano).
const ACCOUNTS_ON = !/export const FIREBASE_CONFIG\s*=\s*null/.test(readFileSync(join(repo, 'js/config.js'), 'utf8'));
if (!ACCOUNTS_ON) cfg.legalPages = cfg.legalPages.filter((p) => p !== 'account-deletion');
const SITE_URL = cfg.siteUrl.replace(/\/$/, '');   // dominio: l'unica costante da cambiare è in config.json
const compat = json(join(here, 'data/compatibility.json'));
const T = Object.fromEntries(cfg.langs.map((l) => [l, json(join(here, `i18n/${l}.json`))]));
const tpl = Object.fromEntries(['base', 'home', 'compat', 'legal', 'notfound', 'dev', 'blogindex', 'post'].map((n) => [n, read(join(here, `templates/${n}.html`))]));
const cssVersion = createHash('sha1').update(read(join(here, 'assets/style.css'))).digest('hex').slice(0, 8);

// ---------- utilità ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
/** {{a.b}} = testo con escape, {{{a.b}}} = HTML già pronto. Una chiave mancante è un errore, non una pagina rotta. */
function render(template, ctx) {
  return template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => { const v = get(ctx, k); if (v == null) throw new Error(`manca ${k}`); return v; })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const v = get(ctx, k); if (v == null) throw new Error(`manca ${k}`); return esc(v); });
}
const langPrefix = (l) => (l === cfg.defaultLang ? '' : `/${l}`);
const pageUrl = (l, slug = '') => `${langPrefix(l)}/${slug ? `${slug}/` : ''}`;
const abs = (path) => SITE_URL + path;

// ---------- icone (SVG semplici, 24x24, tratto) ----------
const ICONS = {
  gears: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  modes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  workouts: '<path d="M4 20V13M9 20V8M14 20v-9M19 20V4"/>',
  route: '<path d="M5 19c4 0 3-6 7-6s3-8 7-8"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M18 14h.01"/>',
  history: '<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/>',
  strava: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  coach: '<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  app: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
const iconBox = (name) => `<div class="ico">${svg(name)}</div>`;

// ---------- segnaposto o screenshot veri ----------
function imageSize(file) { // legge larghezza e altezza dai primi byte di PNG/JPEG/WebP
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; // VP8 (con perdita)
  }
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return [390, 844];
}
function shotHtml(s, t) {
  const file = ['jpg', 'png', 'webp'].map((e) => `${s.k}.${e}`).find((f) => existsSync(join(here, 'assets/shots', f)));
  const fig = file
    ? (([w, h]) => `<img src="/assets/shots/${file}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${esc(s.c)}">`)(imageSize(join(here, 'assets/shots', file)))
    : `<div class="shot-ph" role="img" aria-label="${esc(s.c)}">${esc(t.home.shotPh)}</div>`;
  return `<figure>${fig}<figcaption>${esc(s.c)}</figcaption></figure>`;
}

// ---------- elenchi generati da data/compatibility.json (usati negli articoli) ----------
function compatList(protocol, lang) {
  const rows = compat.trainers.filter((r) => r.protocol === protocol);
  if (!rows.length) throw new Error(`:::compat ${protocol}: nessun rullo con questo protocollo`);
  const st = T[lang].compat.status;
  return `<ul class="compat-list">${rows.map((r) => `<li><strong>${esc(r.name)}</strong>${r.brand ? ` <span class="brand">${esc(r.brand)}</span>` : ''} <span class="badge ${r.status}">${esc(st[r.status])}</span><span class="note">${esc(r.note[lang] || r.note.en)}</span></li>`).join('')}</ul>`;
}
function compatCount(lang) {
  const n = (k) => compat.trainers.filter((r) => r.status === k).length;
  return `<p><strong>${esc(T[lang].blog.compatSummary.replace('{verified}', n('verified')).replace('{partial}', n('partial')).replace('{expected}', n('expected')).replace('{reported}', n('reported')))}</strong></p>`;
}

// ---------- markdown -> html (solo quello che usano i testi legali) ----------
function inline(s, lang) {
  const parts = String(s).split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (i % 2) return `<code>${esc(p.slice(1, -1))}</code>`;
    let h = esc(p);
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      const m = href.match(/^(privacy|terms|account-deletion|licenses|trademarks)\.(?:en|it)\.md$/);
      if (m && !cfg.legalPages.includes(m[1])) return text; // pagina non pubblicata (account spenti): resta il testo, senza collegamento
      if (m) return `<a href="${pageUrl(lang, m[1])}">${text}</a>`;
      return `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener"' : ''}>${text}</a>`;
    });
    return h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
  }).join('');
}
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function md(src, lang) {
  const lines = src.replace(/\r/g, '').split('\n');
  const html = []; let title = ''; let i = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^:::compat(-count)?\s*(.*)$/))) { // :::compat FTMS = elenco dei rulli di quel protocollo, :::compat-count = riepilogo; entrambi dai dati di compatibility.json
      html.push(m[1] ? compatCount(lang) : compatList(m[2].trim(), lang)); i++;
    } else if ((m = l.match(/^!\[([^\]]*)\]\(shot:([\w-]+)\)\s*$/))) { // ![didascalia](shot:nome): screenshot a due righe di testo, per lingua
      html.push(`<figure class="post-shot"><div class="phone">${shotImg(m[2], lang, m[1])}</div><figcaption>${esc(m[1])}</figcaption></figure>`); i++;
    } else if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length; if (n === 1 && !title) title = m[2];
      html.push(`<h${n} id="${slug(m[2])}">${inline(m[2], lang)}</h${n}>`); i++;
    } else if (/^---+\s*$/.test(l)) { html.push('<hr>'); i++; }
    else if (l.startsWith('>')) {
      const q = []; while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote><p>${inline(q.join(' '), lang)}</p></blockquote>`);
    } else if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      html.push(`<div class="tablewrap" tabindex="0"><table><thead><tr>${head.map((c) => `<th>${inline(c, lang)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, lang)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
      const ordered = /^\d+\./.test(l); const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/; const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let t = lines[i++].replace(re, '');
        while (i < lines.length && lines[i].trim() && /^\s+\S/.test(lines[i]) && !re.test(lines[i])) t += ' ' + lines[i++].trim();
        items.push(`<li>${inline(t, lang)}</li>`);
      }
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else {
      const p = []; while (i < lines.length && lines[i].trim() && !/^(#|>|\||---|[-*]\s|\d+\.\s)/.test(lines[i])) p.push(lines[i++].trim());
      html.push(`<p>${inline(p.join(' '), lang)}</p>`);
    }
  }
  return { html: html.join('\n'), title };
}


// ---------- blog: site/blog/<slug>.<lang>.md con intestazione "chiave: valore" tra due righe ---
const HAS_WORKOUT_PLAN = existsSync(join(repo, 'js/games/kit/workout-plan.js'));
const docsGames = existsSync(join(repo, 'docs/games')) ? readdirSync(join(repo, 'docs/games')).filter((f) => f.endsWith('.md')) : [];
const readTime = (text) => Math.max(1, Math.round(text.split(/\s+/).length / 200));
function parsePost(file) {
  const raw = read(file).replace(/\r/g, '');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: manca l'intestazione`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { meta, body: m[2] };
}
const blogDir = join(here, 'blog');
const POSTS = {}; // lang -> [{ slug, meta, body }] dal più recente
for (const lang of cfg.langs) {
  POSTS[lang] = existsSync(blogDir) ? readdirSync(blogDir).filter((f) => f.endsWith(`.${lang}.md`)).map((f) => ({ slug: f.replace(`.${lang}.md`, ''), ...parsePost(join(blogDir, f)) })) : [];
  POSTS[lang].sort((a, b) => b.meta.date.localeCompare(a.meta.date) || Number(a.meta.order || 99) - Number(b.meta.order || 99));
}
const isGuide = (p) => p.meta.kind === 'guide';
const lastmodOf = (p) => p.meta.updated || p.meta.date;
/** «## Questions» / «## Domande» seguito da «### domanda» + risposta = una vera sezione FAQ: ne escono i dati strutturati FAQPage. */
function faqFrom(body) {
  const m = body.match(/^## (?:Questions|Domande)\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  const plain = (t) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  return m[1].split(/^### /m).slice(1).map((b) => { const [q, ...a] = b.split('\n'); return { q: plain(q), a: plain(a.join(' ')) }; }).filter((f) => f.q && f.a);
}
function guideLinks(lang, except = '') {
  const items = POSTS[lang].filter((p) => isGuide(p) && p.slug !== except);
  return items.length ? `<ul class="guide-links">${items.map((p) => `<li><a href="${pageUrl(lang, `blog/${p.slug}`)}">${esc(p.meta.title)}</a></li>`).join('')}</ul>` : '';
}
const fmtDate = (iso, lang) => new Date(iso + 'T12:00:00Z').toLocaleDateString(T[lang].htmlLang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function blogCards(lang, n = 99) {
  return POSTS[lang].slice(0, n).map((p) => `<li><a class="card" href="${pageUrl(lang, `blog/${p.slug}`)}"><time datetime="${p.meta.date}">${esc(fmtDate(p.meta.date, lang))}</time><h3>${esc(p.meta.title)}</h3><p>${esc(p.meta.description)}</p><span class="more">${esc(T[lang].blog.read)} · ${readTime(p.body)} ${esc(T[lang].blog.minutes)}</span></a></li>`).join('');
}

// ---------- contesto comune di una pagina ----------
const written = []; // { path, url, alternates, index }
function ctxFor(lang, extra) {
  const t = T[lang];
  const androidLive = cfg.playStoreLive;
  const releases = `${cfg.github}/releases`;
  return {
    ...t, ...extra,
    htmlLang: t.htmlLang, cssVersion,
    // contatore di visite senza cookie (GoatCounter): solo se configurato in config.json
    analytics: cfg.goatcounter ? `<script data-goatcounter="${cfg.goatcounter}" async src="https://gc.zgo.at/count.js"></script>` : '',
    verification: [['google-site-verification', cfg.searchVerification?.google], ['msvalidate.01', cfg.searchVerification?.bing]]
      .filter(([, v]) => v).map(([n, v]) => `<meta name="${n}" content="${esc(v)}">`).join('\n'),
    homeUrl: pageUrl(lang), compatUrl: pageUrl(lang, 'compatibility'), blogUrl: pageUrl(lang, 'blog'), devUrl: pageUrl(lang, 'developers'), feedUrl: `${pageUrl(lang, 'blog')}feed.xml`, appUrl: cfg.appPath,
    github: cfg.github, issues: cfg.contactIssues,
    androidUrl: androidLive ? cfg.playStore : cfg.apk,
    androidNote: androidLive
      ? `<a href="${esc(cfg.apk)}" rel="noopener">${esc(t.cta.apk)}</a>`
      : `${esc(t.cta.soon)} · <a href="${esc(releases)}" rel="noopener">${esc(t.cta.apk)}</a>`,
    ogImage: abs('/assets/og.png'), ogAlt: t.og.alt,
    icon: Object.fromEntries(['app', 'download', 'code'].map((n) => [n, svg(n)])),
    legalLinks: cfg.legalPages.map((p) => `<li><a href="${pageUrl(lang, p)}">${esc(t.legalNames[p])}</a></li>`).join(''),
  };
}

// Content-Security-Policy: solo ciò che il sito usa davvero (stile e font propri, GoatCounter se configurato, nessuna richiesta ad altri).
// Lo script in linea del modello è ammesso per hash, calcolato su ogni pagina.
function withCsp(html) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  const gc = cfg.goatcounter ? new URL(cfg.goatcounter).origin : '';
  const policy = [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(' ')}${gc ? ' https://gc.zgo.at' : ''}`.trim(),
    "style-src 'self' 'unsafe-inline'", // gli attributi style="" del modello
    `img-src 'self' data:${gc ? ` ${gc}` : ''}`,
    "font-src 'self'",
    gc ? `connect-src ${gc}` : "connect-src 'none'",
    "base-uri 'self'", "form-action 'none'", "object-src 'none'",
  ].join('; ');
  return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

function writePage({ lang, slug: pslug = '', tplName, extra, title, description, jsonld = '', index = true, langsAvailable = cfg.langs, file, ogType = 'website', lastmod = '', headExtra = '' }) {
  const t = T[lang];
  const path = pageUrl(lang, pslug);
  const alternates = langsAvailable.map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(pageUrl(l, pslug))}">`);
  if (langsAvailable.includes(cfg.defaultLang)) alternates.push(`<link rel="alternate" hreflang="x-default" href="${abs(pageUrl(cfg.defaultLang, pslug))}">`);
  const langLinks = langsAvailable.filter((l) => l !== lang).map((l) => `<a class="lang" href="${pageUrl(l, pslug)}" hreflang="${l}" lang="${l}" aria-label="${l.toUpperCase()} – ${esc(T[l].langName)}" title="${esc(T[l].langName)}">${l.toUpperCase()}</a>`).join('');
  const body = render(tpl[tplName], { ...ctxFor(lang, extra) });
  const ctx = {
    ...ctxFor(lang, extra), title, description, content: body,
    robots: index ? 'index, follow' : 'noindex, follow',
    canonical: abs(path), alternates: alternates.join('\n'), langLinks,
    ogLocaleAlt: langsAvailable.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${T[l].ogLocale}">`).join('\n'),
    compatCurrent: pslug === 'compatibility' ? ' aria-current="page"' : '',
    blogCurrent: pslug.startsWith('blog') ? ' aria-current="page"' : '', devCurrent: pslug === 'developers' ? ' aria-current="page"' : '',
    jsonld, csp: '<!--CSP-->', ogType, headExtra,
  };
  const outFile = file || join(out, path, 'index.html');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, withCsp(render(tpl.base, ctx)));
  if (!file) written.push({ path, alternates: langsAvailable.map((l) => [l, pageUrl(l, pslug)]), index, lastmod });
}

// Data dell'ultima modifica dai commit (per lastmod della sitemap); senza git resta vuota e il campo si omette.
function gitDate(paths) {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}

// ---------- costruzione ----------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'assets'), join(out, 'assets'), { recursive: true });

// profilo altimetrico della pagina: cinque "tappe" = cinque sezioni
const ROUTE = [[0, 128], [60, 124], [120, 116], [180, 120], [240, 100], [300, 108], [360, 84], [420, 96], [480, 70], [540, 88], [600, 60], [660, 78], [720, 52], [780, 70], [840, 44], [900, 66], [960, 36], [1020, 48], [1080, 18], [1140, 40], [1200, 34]];
const STOPS = [2, 6, 10, 14, 18]; // indici dei punti con la bandierina
const routeSvg = (() => {
  const line = ROUTE.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const flags = STOPS.map((i) => { const [x, y] = ROUTE[i]; return `<line x1="${x}" y1="${y}" x2="${x}" y2="150" class="drop"/><circle cx="${x}" cy="${y}" r="7" class="dot"/>`; }).join('');
  return `<svg viewBox="0 0 1200 150" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="hatch"/></pattern></defs><path d="${line} L1200 150 L0 150 Z" fill="url(#hatch)"/><path d="${line}" class="line" pathLength="1"/>${flags}</svg>`;
})();
const pad2 = (n) => String(n).padStart(2, '0');
function shotImg(key, lang, alt, { eager = false } = {}) {
  const file = [`${key}-${lang}.webp`, `${key}-en.webp`, `${key}.webp`].find((f) => existsSync(join(here, 'assets/shots', f)));
  if (!file) throw new Error(`manca lo screenshot ${key}`);
  const [w, h] = imageSize(join(here, 'assets/shots', file));
  return `<img src="/assets/shots/${file}" width="${w}" height="${h}" alt="${esc(alt)}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

/** SoftwareApplication: gratis, Android + web, categoria applicazione. Una sola definizione per home, compatibilità e guide. */
const appLd = (lang, description) => ({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#app`, name: 'Spindro: Smart Trainer Cycling', alternateName: 'Spindro',
  description, applicationCategory: 'HealthApplication', operatingSystem: 'Android, Web (Chrome, Edge)',
  url: abs(pageUrl(lang)), downloadUrl: cfg.apk, inLanguage: lang, isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  image: abs('/assets/og.png'), sameAs: [cfg.github], license: 'https://www.gnu.org/licenses/agpl-3.0.html',
});
const ldTag = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const faqLd = (faq, lang) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

for (const lang of cfg.langs) {
  const t = T[lang]; const h = t.home;
  const ld = appLd(lang, h.description);
  writePage({
    lang, tplName: 'home', title: h.title, description: h.description,
    lastmod: gitDate(['site/i18n', 'site/templates/home.html']),
    jsonld: ldTag(ld) + ldTag(faqLd(h.faq.map((f) => ({ q: f.q, a: f.a })), lang)),
    extra: (() => {
      const bib = (i) => `<p class="bib"><span>${esc(h.stageWord)}</span><b>${pad2(i + 1)}</b></p>`;
      const stage = (i, flip) => {
        const st = h.stages[i];
        return `<section class="stage${flip ? ' flip' : ''}" id="${st.id}"><div class="wrap stage-grid"><div class="stage-copy">${bib(i)}<h2>${esc(st.title)}</h2><p class="lead">${esc(st.text)}</p><dl class="roadbook">${st.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div><figure class="stage-shot"><div class="phone">${shotImg(st.img, lang, st.alt)}</div></figure></div></section>`;
      };
      const gameShots = ['game-racer', 'game-horde', 'game-strike', 'game-gruppetto', 'game-planata', 'game-mattoni'];
      return {
        heroImg: shotImg('home', lang, h.heroAlt, { eager: true }),
        routeSvg,
        routeLinks: h.stages.map((st, i) => `<li><a href="#${st.id}"><span>${pad2(i + 1)}</span>${esc(st.nav)}</a></li>`).join(''),
        stageConnect: stage(0, false), stageTrain: stage(1, true), stageRecord: stage(3, false),
        bibPlay: bib(2), playTitle: h.stages[2].title, playText: h.stages[2].text,
        bibOwn: bib(4), ownTitle: h.stages[4].title,
        games: h.games.map(([name, text], i) => `<li><figure><div class="phone">${shotImg(gameShots[i], lang, h.gamesAlt[i])}</div><figcaption><b>${esc(name)}</b><span>${esc(text)}</span></figcaption></figure></li>`).join(''),
        gamesFollow: HAS_WORKOUT_PLAN ? ` ${h.gamesFollow}` : '',
        devPoints: h.devPoints.map((p) => `<li>${esc(p)}</li>`).join(''),
        devUrl: pageUrl(lang, 'developers'), blogUrl: pageUrl(lang, 'blog'),
        blogCards: blogCards(lang, 3),
        ownPoints: h.ownPoints.map((p) => `<li>${esc(p)}</li>`).join(''),
        compatRows: h.compatRows.map(([name, what, st, label]) => `<tr><th scope="row">${esc(name)}<small>${esc(what)}</small></th><td><span class="chip ${st}">${esc(label)}</span></td></tr>`).join(''),
        guideLinks: guideLinks(lang),
        faq: h.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join(''),
      };
    })(),
  });

  // compatibilità
  const c = t.compat;
  const table = (rows) => `<div class="tablewrap" tabindex="0"><table class="ctable"><thead><tr><th scope="col">${esc(c.cols.device)}</th><th scope="col">${esc(c.cols.protocol)}</th><th scope="col">${esc(c.cols.status)}</th><th scope="col">${esc(c.cols.note)}</th></tr></thead><tbody>${rows.map((r) => {
    const reports = r.reports ? ` (${r.reports})` : '';
    return `<tr><td data-l="${esc(c.cols.device)}"><strong>${esc(r.name)}</strong>${r.brand ? `<span class="brand">${esc(r.brand)}</span>` : ''}</td><td data-l="${esc(c.cols.protocol)}">${esc(r.protocol)}</td><td data-l="${esc(c.cols.status)}"><span class="badge ${r.status}">${esc(c.status[r.status])}${reports}</span></td><td data-l="${esc(c.cols.note)}">${esc(r.note[lang] || r.note.en)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  writePage({
    lang, slug: 'compatibility', tplName: 'compat', title: c.title, description: c.description,
    lastmod: gitDate(['site/data/compatibility.json', 'site/templates/compat.html', 'site/i18n']), jsonld: ldTag(appLd(lang, t.home.description)),
    extra: {
      guideLinks: guideLinks(lang),
      connectRows: c.connect.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join(''),
      connectDoc: `${cfg.github}/blob/main/docs/connecting-devices.md`,
      legend: ['verified', 'partial', 'expected', 'reported'].map((k) => `<li><span class="badge ${k}">${esc(c.status[k])}</span> ${esc(c.statusDesc[k])}</li>`).join(''),
      tableTrainers: table(compat.trainers), tableControllers: table(compat.controllers), tableWatches: table(compat.watches),
    },
  });
}

// pagine legali da docs/legal/*.md (en e it; le altre lingue ripiegano sull'inglese)
const legalWarnings = [];
for (const lang of cfg.langs) {
  const t = T[lang];
  for (const p of cfg.legalPages) {
    const have = (l) => existsSync(join(repo, `docs/legal/${p}.${l}.md`));
    const contentLang = have(lang) ? lang : 'en';
    const src = read(join(repo, `docs/legal/${p}.${contentLang}.md`));
    const { html, title } = md(src, lang);
    const placeholders = [...new Set(src.match(/\[[A-ZÀ-Ü][A-ZÀ-Ü0-9 .…\/-]{2,}\](?!\()/g) || [])];
    const draft = placeholders.length > 0 || /DRAFT|BOZZA/.test(src);
    if (draft && lang === cfg.defaultLang) legalWarnings.push(`${p}: ${placeholders.join(' ') || 'bozza'}`);
    writePage({
      lang, slug: p, tplName: 'legal', title: t.legal.title.replace('{title}', title), description: t.legal.description.replace('{title}', title),
      index: !draft, langsAvailable: cfg.langs.filter(have), lastmod: gitDate([`docs/legal/${p}.${contentLang}.md`]),
      extra: { body: html, contentLang, draftNote: draft ? `<blockquote><p>${esc(t.legal.draft)}</p></blockquote>` : '' },
    });
  }
}
// se la lingua non ha il documento, writePage usa comunque `lang` per la scheda; la lista alternates contiene solo le lingue con testo vero.


// ---------- sviluppatori ----------
// Le guide vivono nel repository (docs/games/*.md); i link ci sono solo per i file che esistono davvero.
const DEV_COMMANDS = ['git clone https://github.com/C1aud1o/Spindro.git && cd Spindro', 'git checkout -b game/mygame beta', 'npm ci', 'npm run dev', '# then open  http://127.0.0.1:5173/index.html?game=tempo&demo=1', '', 'mkdir js/games/mygame', 'cp js/games/template/tempo.js js/games/mygame/index.js', '# add one line to js/games/registry.js, add games.mygame.* to the 5 locale files', '', 'npm run game:check -- mygame'].join('\n');
for (const lang of cfg.langs) {
  const d = T[lang].dev;
  const ghBlob = (f) => `${cfg.github}/blob/main/${f}`;
  const DOCS = [['CREATE-A-GAME.md', d.docsGuide], ['API.md', d.docsApi], ['DESIGN-RULES.md', d.docsRules]];
  const docLinks = DOCS.filter(([f]) => existsSync(join(repo, 'docs/games', f))).map(([f, label], i) => `<a class="btn${i ? '' : ' primary'}" href="${ghBlob(`docs/games/${f}`)}" rel="noopener">${esc(label)}</a>`);
  writePage({
    lang, slug: 'developers', tplName: 'dev', title: d.title, description: d.description, lastmod: gitDate(['site/templates/dev.html', 'site/i18n']),
    jsonld: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: d.h1, description: d.description, inLanguage: lang, url: abs(pageUrl(lang, 'developers')), publisher: { '@type': 'Organization', name: 'Spindro', url: SITE_URL } }).replace(/</g, '\\u003c')}</script>`,
    extra: {
      kit: d.kit.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join(''),
      rules: d.rules.map((r) => `<li>${esc(r)}</li>`).join(''),
      three: d.three.map((r) => `<li>${esc(r)}</li>`).join(''),
      ship: d.ship.map((r) => `<li>${esc(r)}</li>`).join(''),
      commands: esc(DEV_COMMANDS),
      docLinks: docLinks.join(''),
      tempoShot: shotImg('tempo-menu', lang, d.tempoAlt),
    },
  });
}

// ---------- blog ----------
for (const lang of cfg.langs) {
  const t = T[lang]; const b = t.blog;
  const feedHref = `${pageUrl(lang, 'blog')}feed.xml`;
  const feedLink = `<link rel="alternate" type="application/rss+xml" title="Spindro: ${esc(b.h1)} (${lang})" href="${feedHref}">`;
  writePage({ lang, slug: 'blog', tplName: 'blogindex', title: b.title, description: b.description, jsonld: feedLink, lastmod: POSTS[lang].map(lastmodOf).sort().pop() || '', extra: { cards: blogCards(lang), guideLinks: guideLinks(lang) } });
  for (const post of POSTS[lang]) {
    const m = post.meta; const url = abs(pageUrl(lang, `blog/${post.slug}`));
    const { html } = md(post.body, lang);
    const others = POSTS[lang].filter((x) => x.slug !== post.slug);
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: m.title, description: m.description, datePublished: m.date, dateModified: lastmodOf(post), inLanguage: lang,
      author: { '@type': 'Organization', name: 'Spindro', url: SITE_URL }, publisher: { '@type': 'Organization', name: 'Spindro', url: SITE_URL, logo: { '@type': 'ImageObject', url: abs('/assets/og.png') } },
      mainEntityOfPage: url, image: abs(`/assets/shots/${m.image}-${lang}.webp`), ...(isGuide(post) ? { about: { '@id': `${SITE_URL}/#app` } } : {}) };
    const faq = faqFrom(post.body);
    // le guide parlano di un'app: la descrivono anche come SoftwareApplication (gratis, sistemi operativi, categoria); la FAQ solo se la pagina ne ha una vera
    const ldAll = [ld, ...(isGuide(post) ? [appLd(lang, T[lang].home.description)] : []), ...(faq.length ? [faqLd(faq, lang)] : [])].map(ldTag).join('');
    writePage({
      lang, slug: `blog/${post.slug}`, tplName: 'post', title: `${m.title} | Spindro`, description: m.description, ogType: 'article', lastmod: lastmodOf(post),
      headExtra: `<meta property="article:published_time" content="${m.date}">\n<meta property="article:modified_time" content="${lastmodOf(post)}">`,
      jsonld: feedLink + ldAll,
      extra: { postTitle: m.title, postDate: m.date, postDateText: fmtDate(m.date, lang), postRead: `${readTime(post.body)} ${b.minutes}`, postBody: html, moreCards: others.length ? `<h2>${esc(b.more)}</h2><ul class="cards">${blogCards(lang).split('</li>').filter(Boolean).filter((c) => !c.includes(`/blog/${post.slug}/`)).map((c) => c + '</li>').join('')}</ul>` : '' },
    });
  }
  // feed RSS 2.0
  const items = POSTS[lang].map((p) => `    <item>\n      <title>${esc(p.meta.title)}</title>\n      <link>${abs(pageUrl(lang, `blog/${p.slug}`))}</link>\n      <guid isPermaLink="true">${abs(pageUrl(lang, `blog/${p.slug}`))}</guid>\n      <pubDate>${new Date(p.meta.date + 'T12:00:00Z').toUTCString()}</pubDate>\n      <description>${esc(p.meta.description)}</description>\n    </item>`).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Spindro: ${esc(b.h1)}</title>\n    <link>${abs(pageUrl(lang, 'blog'))}</link>\n    <description>${esc(b.description)}</description>\n    <language>${lang}</language>\n    <atom:link href="${abs(feedHref)}" rel="self" type="application/rss+xml"/>\n${items}\n  </channel>\n</rss>\n`;
  mkdirSync(join(out, pageUrl(lang, 'blog')), { recursive: true });
  writeFileSync(join(out, pageUrl(lang, 'blog'), 'feed.xml'), feed);
}

// 404 (GitHub Pages lo serve per gli URL inesistenti)
{
  const t = T[cfg.defaultLang];
  writePage({ lang: cfg.defaultLang, tplName: 'notfound', title: `${t.notFound.title} | Spindro`, description: t.notFound.text, index: false, file: join(out, '404.html') });
}

// sitemap, robots
const urls = written.filter((w) => w.index);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map((w) => `  <url>\n    <loc>${abs(w.path)}</loc>\n${w.lastmod ? `    <lastmod>${w.lastmod}</lastmod>\n` : ''}${w.alternates.map(([l, p]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(p)}"/>`).join('\n')}\n  </url>`).join('\n')}\n</urlset>\n`;
writeFileSync(join(out, 'sitemap.xml'), sitemap);
// robots: tutti i motori e gli assistenti AI possono leggere il sito (tranne la beta); i crawler AI sono nominati esplicitamente
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'Google-Extended', 'PerplexityBot', 'Bingbot'];
writeFileSync(join(out, 'robots.txt'), `${['*', ...AI_BOTS].map((u) => `User-agent: ${u}\nAllow: /\nDisallow: /beta/\n`).join('\n')}\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// llms.txt (formato llmstxt.org): cos'è Spindro in poche righe e dove trovare il resto, per gli assistenti AI che leggono il sito
{
  const en = T.en || T[cfg.defaultLang];
  const plain = (txt) => txt.replace(/^:::.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const postLinks = (lang) => POSTS[lang].map((p) => `- [${p.meta.title}](${abs(pageUrl(lang, `blog/${p.slug}`))}): ${p.meta.description}`).join('\n');
  const llms = `# Spindro

> ${en.home.description}

Spindro is free and open source (AGPL-3.0). It runs in Chrome or Edge on Android, Windows, macOS and Linux, and as an Android app; iPhone and iPad browsers have no Web Bluetooth, so they are not supported. No account and no subscription are needed. Only the Van Rysel D100 trainer and the + and - keys of a Zwift Click v2 have been tested on real hardware; other FTMS, Tacx FE-C and Wahoo trainers are expected to work but are not verified.

## Use it
- [Web app](${abs(cfg.appPath)}): open it in Chrome or Edge and connect the trainer over Bluetooth
- [Android app (APK)](${cfg.apk})
- [Compatible trainers and controllers](${abs(pageUrl('en', 'compatibility'))})
- [Source code](${cfg.github})

## Guides and articles (English)
${postLinks('en')}

## Guide e articoli (italiano)
${postLinks('it')}

## Optional
- [Privacy policy](${abs(pageUrl('en', 'privacy'))})
- [Full text of the guides](${SITE_URL}/llms-full.txt)
`;
  writeFileSync(join(out, 'llms.txt'), llms);
  const full = [`# Spindro: full text of the guides (English)\n\n> ${en.home.description}\n`, ...POSTS.en.map((p) => `\n## ${p.meta.title}\n\nSource: ${abs(pageUrl('en', `blog/${p.slug}`))}\n\n${plain(p.body)}\n`)].join('');
  writeFileSync(join(out, 'llms-full.txt'), full);
}

console.log(`site: ${written.length} pagine in ${out} (${cfg.langs.join(', ')}), dominio ${SITE_URL}`);
if (legalWarnings.length) console.log(`pagine legali ancora bozza (noindex, fuori dalla sitemap):\n  - ${legalWarnings.join('\n  - ')}`);
for (const l of cfg.langs) for (const f of ['home', 'compat']) if (!T[l][f]) throw new Error(`${l}: manca ${f}`);
