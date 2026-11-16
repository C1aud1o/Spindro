// Beta build probe: CHANNEL=beta WEB_DEPLOY=1 build → serve www/ → zero CSP violations, localStorage isolated under "beta:".
import { chromium } from '@playwright/test';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
execSync('node scripts/copy-web.mjs', { cwd: root, env: { ...process.env, CHANNEL: 'beta', WEB_DEPLOY: '1' }, stdio: 'pipe' });
const www = join(root, 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(www, p); if (!f.startsWith(www) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }).listen(4192, '127.0.0.1');
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 780 } });
const page = await ctx.newPage(); const log = [];
await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`${m.type()}: ${m.text()}`); }); page.on('pageerror', (e) => log.push('pageerror ' + e.message));
// a "stable" key written to the real storage first: the beta must not see it
await page.goto('http://127.0.0.1:4192/index.html'); await page.evaluate(() => { const s = window.__spindroStable.storage; s.setItem('ftp', '321'); s.setItem('beta:analytics', '0'); s.setItem('beta:safetyAck', '1'); });
await page.reload(); await page.waitForSelector('#openSettings'); await page.waitForTimeout(800);
const r = await page.evaluate(() => ({ csp: window.__csp, ftpSeen: localStorage.getItem('ftp'), shim: !!window.__spindroStable, badge: !document.getElementById('betaBadge').hidden, robots: !!document.querySelector('meta[name=robots]') }));
console.log(JSON.stringify(r));
// set something through the app: it must land under beta:
await page.click('#openSettings'); await page.fill('#ftp', '250'); await page.press('#ftp', 'Tab'); await page.waitForTimeout(300);
const keys = await page.evaluate(() => { const s = window.__spindroStable.storage; const k = []; for (let i = 0; i < s.length; i++) k.push(s.key(i)); return k; });
console.log('real storage keys:', keys.join(', '));
console.log('every app key prefixed beta: →', keys.filter((k) => k !== 'ftp' && !k.startsWith('beta:')).length === 0 ? 'PASS' : 'FAIL ' + keys.filter((k) => k !== 'ftp' && !k.startsWith('beta:')));
console.log('stable ftp untouched →', await page.evaluate(() => window.__spindroStable.storage.getItem('ftp')) === '321' ? 'PASS' : 'FAIL');
console.log('console:', log.filter((l) => !/Service Worker/.test(l)));
await b.close(); srv.close();
