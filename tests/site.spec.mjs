// Showcase site: builds site/ into a temp folder and checks every page (no browser needed): one h1, titles and descriptions,
// canonical and hreflang, images with size and alt, every internal link / image / anchor resolves, sitemap and robots, contrast.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
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

test('blog articles are 700 to 1000 words', () => {
  for (const f of readdirSync(join(root, 'site/blog')).filter((x) => x.endsWith('.md'))) {
    const body = readFileSync(join(root, 'site/blog', f), 'utf8').split(/^---$/m)[2].replace(/!\[[^\]]*\]\(shot:[^)]*\)/g, '');
    const words = body.split(/\s+/).filter(Boolean).length;
    expect(words, f).toBeGreaterThanOrEqual(700); expect(words, f).toBeLessThanOrEqual(1000);
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
