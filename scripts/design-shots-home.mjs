// Foto per il documento di design (docs/design). Uso dalla radice del repo: node scripts/design-shots-home.mjs ...
import { createRequire } from 'node:module'; const { chromium } = createRequire(process.cwd() + '/')('playwright');
import { spawn } from 'node:child_process';
const tag = process.argv[2];
const port = 4301;
const srv = spawn('node', ['tests/serve.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [w, h, n] of [[390, 844, 'mobile'], [1280, 800, 'desktop']]) {
  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('lang', 'it'); localStorage.setItem('analytics', '0'); localStorage.setItem('onboarded','1'); } catch {} });
    await p.goto(`http://127.0.0.1:${port}/index.html`);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `docs/design/home-${tag}-${n}-${theme}.png`, fullPage: false });
    if (theme === 'dark') {
      const c2 = await b.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' }); const q = await c2.newPage();
      await q.addInitScript(() => { try { localStorage.setItem('lang', 'it'); localStorage.setItem('analytics', '0'); localStorage.setItem('onboarded','1'); } catch {} });
      await q.addInitScript({ path: process.cwd() + '/tests/fake-ble.js' });
      await q.goto(`http://127.0.0.1:${port}/index.html`); await q.click('#connectTrainer'); await q.waitForTimeout(2500);
      await q.screenshot({ path: `docs/design/home-${tag}-${n}-collegato.png` }); await c2.close();
      await p.click('#openGame'); await p.waitForTimeout(600);
      await p.screenshot({ path: `docs/design/giochi-menu-${tag}-${n}.png` });
    }
    await ctx.close();
  }
}
await b.close(); srv.kill();
