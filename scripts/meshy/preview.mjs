// Foto di ogni modello di assets/3d/meshy da 3 lati (fronte, lato, 3/4) in docs/meshy-preview/<nome>.png
// Uso: node scripts/meshy/preview.mjs [nome...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const port = 4199;
const srv = spawn('node', ['tests/serve.mjs'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const dir = path.join(root, 'assets/3d/meshy'), out = path.join(root, 'docs/meshy-preview');
fs.mkdirSync(out, { recursive: true });
const want = process.argv.slice(2);
const names = fs.readdirSync(dir).filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4)).filter(n => !want.length || want.includes(n));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 500 } });
for (const n of names) {
  await page.goto(`http://localhost:${port}/scripts/meshy/viewer.html?m=${n}`);
  try { await page.waitForFunction(() => document.title.startsWith('ready'), null, { timeout: 30000 }); } catch { console.log(n, 'timeout'); continue; }
  await page.screenshot({ path: path.join(out, n + '.png') });
  console.log(n, (await page.title()).slice(6));
}
await browser.close(); srv.kill();
