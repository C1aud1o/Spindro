// Showcase site: builds site/ into a temp folder and checks every page (no browser needed): one h1, titles and descriptions,
// canonical and hreflang, images with size and alt, every internal link / image / anchor resolves, sitemap and robots, contrast.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'site/config.json'), 'utf8'));
const SITE = cfg.siteUrl.replace(/\/$/, '');
let dist; const pages = {}; // url path -> html
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test.beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'spindro-site-'));
  execFileSync('node', [join(root, 'site/build.mjs'), '--out', dist], { stdio: 'pipe' });
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    const rel = '/' + f.slice(dist.length + 1).replace(/index\.html$/, '');
    pages[rel] = readFileSync(f, 'utf8');
  }
});
test.afterAll(() => { if (dist) rmSync(dist, { recursive: true, force: true }); });

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? '']));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))].map((m) => attrs(m[1]));
const exists = (p) => { const f = join(dist, decodeURIComponent(p)); return existsSync(f) && (statSync(f).isFile() || existsSync(join(f, 'index.html'))); };

test('every page has one h1, a title, a description and a correct canonical', () => {
  const seen = new Map();
  for (const [url, html] of Object.entries(pages)) {
    expect([...html.matchAll(/<h1\b/g)].length, `${url}: h1 count`).toBe(1);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]; expect(title, `${url}: title`).toBeTruthy();
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1]; expect(desc, `${url}: description`).toBeTruthy();
    if (url !== '/404.html') expect(desc.length, `${url}: description length`).toBeGreaterThan(60); expect(desc.length, `${url}: description length`).toBeLessThan(260);
    expect(html).toMatch(/<html lang="(en|it)"/);
    if (url === '/404.html') continue;
    expect(html, url).toContain(`<link rel="canonical" href="${SITE}${url}">`);
    expect(seen.has(title), `${url}: duplicate title with ${seen.get(title)}`).toBe(false); seen.set(title, url);
  }
  expect(Object.keys(pages)).toEqual(expect.arrayContaining(['/', '/it/', '/blog/', '/it/blog/', '/developers/', '/it/developers/', '/compatibility/', '/404.html']));
});

test('hreflang alternates exist and point back', () => {
  for (const [url, html] of Object.entries(pages)) {
    if (/noindex/.test(html)) continue;
    for (const a of tags(html, 'link').filter((l) => l.rel === 'alternate' && l.hreflang)) {
      expect(a.href.startsWith(SITE), `${url}: ${a.href}`).toBe(true);
      const path = a.href.slice(SITE.length); expect(pages[path], `${url}: hreflang target ${path}`).toBeTruthy();
      if (a.hreflang !== 'x-default') expect(pages[path], `${path} must link back to ${url}`).toContain(`href="${SITE}${url}"`);
    }
  }
});

test('internal links, images, scripts and anchors all resolve', () => {
  const bad = [];
  for (const [url, html] of Object.entries(pages)) {
    const refs = [...tags(html, 'a').map((a) => a.href), ...tags(html, 'img').map((a) => a.src), ...tags(html, 'link').map((a) => a.href), ...tags(html, 'script').map((a) => a.src)].filter(Boolean);
    for (let ref of refs) {
      if (/^(mailto:|tel:|data:|javascript:)/.test(ref)) continue;
      if (ref.startsWith(SITE + '/') || ref === SITE) ref = ref.slice(SITE.length) || '/';
      if (/^https?:|^\/\//.test(ref)) continue; // external: not fetched here
      const [pathPart, hash] = ref.split('#'); const base = pathPart.split('?')[0] || url;
      const target = base.startsWith('/') ? base : resolve(url, base);
      if (target === '/app/' || target.startsWith('/app/') || target === '/beta/') continue; // the app is deployed next to the site
      if (!exists(target)) bad.push(`${url} -> ${ref}`);
      else if (hash && pages[target] && !new RegExp(`id="${decodeURIComponent(hash)}"`).test(pages[target])) bad.push(`${url} -> ${ref} (no such anchor)`);
    }
  }
  expect(bad).toEqual([]);
});

test('images have size and alt; below-the-fold images are lazy', () => {
  for (const [url, html] of Object.entries(pages)) {
    const imgs = tags(html, 'img');
    imgs.forEach((i, n) => {
      expect(i.width && i.height, `${url}: ${i.src} needs width and height`).toBeTruthy();
      expect(i.alt, `${url}: ${i.src} needs alt`).toBeTruthy();
      if (n > 0) expect(i.loading, `${url}: ${i.src} should be lazy`).toBe('lazy');
    });
  }
});

test('sitemap, robots, feeds', () => {
  const sm = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) expect(pages[l.slice(SITE.length)], `sitemap ${l}`).toBeTruthy();
  for (const p of ['/', '/it/', '/blog/', '/it/blog/', '/developers/', '/it/developers/', '/compatibility/', '/blog/why-we-built-spindro/', '/it/blog/games-that-are-workouts/']) expect(locs, p).toContain(SITE + p);
  expect(locs.some((l) => l.includes('/404'))).toBe(false);
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  expect(robots).toContain('Disallow: /beta/'); expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  for (const f of ['/blog/feed.xml', '/it/blog/feed.xml']) {
    const x = readFileSync(join(dist, f), 'utf8'); expect(x).toContain('<rss'); expect((x.match(/<item>/g) || []).length).toBeGreaterThanOrEqual(3);
  }
  const post = pages['/blog/why-we-built-spindro/'];
  expect(post).toContain('"@type":"Article"'); expect(post).toContain('application/rss+xml');
});

test('no account-deletion page while accounts are switched off', () => {
  const cfgJs = readFileSync(join(root, 'js/config.js'), 'utf8');
  if (!/export const FIREBASE_CONFIG\s*=\s*null/.test(cfgJs)) return;
  expect(Object.keys(pages).filter((u) => u.includes('account-deletion'))).toEqual([]);
  expect(readFileSync(join(dist, 'sitemap.xml'), 'utf8')).not.toContain('account-deletion');
  expect(pages['/']).not.toContain('account-deletion');
});

// Articoli del blog: 700-1000 parole; guide (kind: guide, pensate per le ricerche): 500-900.
const posts = () => readdirSync(join(root, 'site/blog')).filter((x) => x.endsWith('.md')).map((f) => {
  const raw = readFileSync(join(root, 'site/blog', f), 'utf8'); const [, head, body] = raw.split(/^---$/m);
  const meta = Object.fromEntries(head.trim().split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  const [, slug, lang] = f.match(/^(.*)\.(en|it)\.md$/);
  return { f, slug, lang, meta, body, words: body.replace(/!\[[^\]]*\]\(shot:[^)]*\)/g, '').split(/\s+/).filter(Boolean).length };
});
test('blog articles are 700 to 1000 words, guides 500 to 900', () => {
  for (const p of posts()) {
    const [lo, hi] = p.meta.kind === 'guide' ? [500, 900] : [700, 1000];
    expect(p.words, p.f).toBeGreaterThanOrEqual(lo); expect(p.words, p.f).toBeLessThanOrEqual(hi);
  }
});

test('text colours have at least 4.5:1 contrast', () => {
  const css = readFileSync(join(root, 'site/assets/style.css'), 'utf8');
  const tok = Object.fromEntries([...css.matchAll(/--(paper-2|paper|ink|lime|mute): (#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [[tok.ink, tok.paper], [tok.ink, tok['paper-2']], [tok.mute, tok.paper], [tok.mute, tok['paper-2']], [tok.ink, tok.lime], [tok.lime, tok.ink], [tok.paper, tok.ink], ['#a9a79b', tok.ink], ['#cfcdc1', tok.ink], ['#8f8d82', tok.ink], ['#2c2b27', tok['paper-2']]];
  for (const [fg, bg] of pairs) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});

// ---------- SEO: dati strutturati, sitemap, feed, guide ----------
const GUIDES = ['free-smart-trainer-app-no-subscription', 'van-rysel-d100-without-zwift', 'zwift-click-without-zwift', 'free-erg-workouts-in-the-browser', 'which-smart-trainers-work-with-spindro'];
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const ldOf = (html, type) => ldBlocks(html).map((b) => JSON.parse(b)).find((o) => o['@type'] === type);

test('structured data is valid JSON on every page; applications are free with operating systems and category', () => {
  for (const [url, html] of Object.entries(pages)) {
    for (const b of ldBlocks(html)) { let o; expect(() => { o = JSON.parse(b); }, `${url}: JSON-LD`).not.toThrow(); expect(o['@context'], url).toBe('https://schema.org'); expect(o['@type'], url).toBeTruthy(); }
  }
  for (const url of ['/', '/it/', '/compatibility/', '/it/compatibility/', ...GUIDES.flatMap((g) => [`/blog/${g}/`, `/it/blog/${g}/`])]) {
    const app = ldOf(pages[url], 'SoftwareApplication'); expect(app, `${url}: SoftwareApplication`).toBeTruthy();
    expect(app.offers.price, url).toBe('0'); expect(app.isAccessibleForFree, url).toBe(true);
    expect(app.operatingSystem, url).toMatch(/Android/); expect(app.operatingSystem, url).toMatch(/Web/); expect(app.applicationCategory, url).toBeTruthy();
  }
  for (const p of posts()) {
    const url = `${p.lang === 'en' ? '' : '/it'}/blog/${p.slug}/`; const art = ldOf(pages[url], 'Article');
    expect(art, `${url}: Article`).toBeTruthy(); expect(art.datePublished, url).toBe(p.meta.date); expect(art.headline, url).toBe(p.meta.title); expect(art.inLanguage, url).toBe(p.lang);
    expect(pages[url], url).toContain('<meta property="og:type" content="article">');
  }
});

test('FAQ structured data only where the page has a real FAQ, and it matches the visible questions', () => {
  for (const [url, html] of Object.entries(pages)) {
    const faq = ldOf(html, 'FAQPage');
    const visible = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1]).concat(/<h2 id="(questions|domande)">/.test(html) ? [...html.matchAll(/<h3 id="[^"]*">([^<]+)<\/h3>/g)].map((m) => m[1]) : []);
    if (!faq) { expect(/<h2 id="(questions|domande)">/.test(html) || /<details>/.test(html), `${url}: has a FAQ but no FAQPage data`).toBe(false); continue; }
    expect(visible.length, `${url}: FAQPage without a visible FAQ`).toBeGreaterThan(0);
    const names = faq.mainEntity.map((q) => q.name);
    for (const q of names) expect(visible.map((v) => v.replace(/&amp;|&quot;|&#39;/g, '')), `${url}: ${q}`).toContain(q.replace(/&amp;|&quot;|&#39;/g, ''));
    for (const q of faq.mainEntity) expect(q.acceptedAnswer.text.length, `${url}: ${q.name}`).toBeGreaterThan(20);
  }
  for (const url of ['/', '/it/']) expect(ldOf(pages[url], 'FAQPage').mainEntity.length, url).toBeGreaterThanOrEqual(5);
  for (const g of ['free-smart-trainer-app-no-subscription', 'van-rysel-d100-without-zwift', 'zwift-click-without-zwift', 'free-erg-workouts-in-the-browser']) for (const u of [`/blog/${g}/`, `/it/blog/${g}/`]) expect(ldOf(pages[u], 'FAQPage'), u).toBeTruthy();
  expect(ldOf(pages['/blog/which-smart-trainers-work-with-spindro/'], 'FAQPage')).toBeFalsy(); // that page has no FAQ
});

test('every article is in the sitemap (with lastmod) and in the RSS feed of its language', () => {
  const sm = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const entries = new Map([...sm.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)].map((m) => [m[1], m[2]]));
  for (const p of posts()) {
    const loc = `${SITE}${p.lang === 'en' ? '' : '/it'}/blog/${p.slug}/`;
    expect(entries.has(loc), `sitemap: ${loc}`).toBe(true);
    expect(entries.get(loc), `lastmod: ${loc}`).toContain(`<lastmod>${p.meta.updated || p.meta.date}</lastmod>`);
    const feed = readFileSync(join(dist, p.lang === 'en' ? '' : 'it', 'blog/feed.xml'), 'utf8');
    expect(feed, `feed: ${loc}`).toContain(`<link>${loc}</link>`);
  }
  for (const loc of [`${SITE}/blog/`, `${SITE}/it/blog/`]) expect(entries.get(loc), `lastmod ${loc}`).toMatch(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
  for (const g of GUIDES) for (const loc of [`${SITE}/blog/${g}/`, `${SITE}/it/blog/${g}/`]) expect(entries.has(loc), loc).toBe(true);
});

test('guides: both languages, internal links to other guides, home and compatibility, a way to open the app and download for Android', () => {
  for (const g of GUIDES) for (const lang of ['en', 'it']) {
    const url = `${lang === 'en' ? '' : '/it'}/blog/${g}/`; const html = pages[url]; expect(html, url).toBeTruthy();
    const main = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    const hrefs = tags(main, 'a').map((a) => a.href).filter(Boolean);
    expect(hrefs.some((h) => h.startsWith(`${lang === 'en' ? '' : '/it'}/blog/`) && !h.includes(g)), `${url}: link to another article`).toBe(true);
    expect(hrefs, url).toContain('/app/'); expect(hrefs.some((h) => h.endsWith('.apk')), `${url}: Android download`).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/compatibility/')), `${url}: compatibility link`).toBe(true);
    expect(main, url).toMatch(/<figure class="post-shot">/);
    expect([...html.matchAll(/<link rel="alternate" hreflang="(en|it|x-default)"/g)].length, url).toBe(3);
  }
  for (const url of ['/', '/it/', '/compatibility/', '/it/compatibility/', '/blog/', '/it/blog/']) for (const g of GUIDES) expect(pages[url], `${url} links ${g}`).toContain(`/blog/${g}/"`);
});

test('the trainers guide is generated from compatibility.json and says what is verified', () => {
  const data = JSON.parse(readFileSync(join(root, 'site/data/compatibility.json'), 'utf8'));
  for (const url of ['/blog/which-smart-trainers-work-with-spindro/', '/it/blog/which-smart-trainers-work-with-spindro/']) {
    const html = pages[url]; const esc = (x) => x.replace(/&/g, '&amp;');
    for (const r of data.trainers) expect(html, `${url}: ${r.name}`).toContain(`<strong>${esc(r.name)}</strong>`);
    const verified = data.trainers.filter((r) => r.status === 'verified');
    expect(verified.map((r) => r.name)).toEqual(['Van Rysel D100']);
    expect(html).toMatch(/<li><strong>Van Rysel D100<\/strong>[^]*?class="badge verified"/);
    expect((html.match(/class="badge verified"/g) || []).length, url).toBe(verified.length);
    for (const proto of ['FTMS', 'Tacx FE-C', 'Wahoo']) expect(html, `${url}: ${proto}`).toContain(proto);
    expect(html, url).toMatch(/id="iphone-(and|e)-ipad"/);
  }
});

test('search-engine verification tags come from config.json, and are absent while the values are empty', () => {
  for (const [url, html] of Object.entries(pages)) { expect(html, url).not.toContain('google-site-verification'); expect(html, url).not.toContain('msvalidate.01'); }
  expect(cfg.searchVerification, 'config has the optional field, empty').toEqual({ google: '', bing: '' });
  const tmp = mkdtempSync(join(tmpdir(), 'spindro-site-v-'));
  try {
    const cfgFile = join(tmp, 'config.json');
    writeFileSync(cfgFile, JSON.stringify({ ...cfg, searchVerification: { google: 'G-TOKEN_123', bing: 'B1NG0123456789' } }));
    execFileSync('node', [join(root, 'site/build.mjs'), '--out', join(tmp, 'out'), '--config', cfgFile], { stdio: 'pipe' });
    for (const rel of ['index.html', 'it/index.html', 'blog/van-rysel-d100-without-zwift/index.html']) {
      const html = readFileSync(join(tmp, 'out', rel), 'utf8');
      expect(html, rel).toContain('<meta name="google-site-verification" content="G-TOKEN_123">'); expect(html, rel).toContain('<meta name="msvalidate.01" content="B1NG0123456789">');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
