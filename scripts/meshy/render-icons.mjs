// Icone 3D → assets/icons/<nome>.png e .webp (256 px, trasparenti, stessa angolazione e luce).
// Uso: node scripts/meshy/render-icons.mjs [nome...]   (legge scripts/meshy/work/*.glb del catalogo icone)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const port = 4198;
const srv = spawn('node', ['tests/serve.mjs'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const cat = JSON.parse(fs.readFileSync(path.join(root, 'scripts/meshy/catalog-icons.json'), 'utf8'));
const want = process.argv.slice(2);
const out = path.join(root, 'assets/icons'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
for (const e of cat) {
  if (want.length && !want.includes(e.name)) continue;
  if (!fs.existsSync(path.join(root, 'scripts/meshy/work', e.name + '.glb'))) { console.log(e.name, 'manca il glb'); continue; }
  await page.goto(`http://127.0.0.1:${port}/scripts/meshy/icon-render.html?m=${e.name}`);
  try { await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 }); } catch { console.log(e.name, 'timeout'); continue; }
  for (const [k, ext] of [['__png', 'png'], ['__webp', 'webp']]) {
    const d = await page.evaluate(k2 => window[k2], k); fs.writeFileSync(path.join(out, `${e.name}.${ext}`), Buffer.from(d.split(',')[1], 'base64'));
  }
  console.log(e.name, 'ok');
}
await browser.close(); srv.kill();
