// Foto per il documento di design (docs/design). Uso dalla radice del repo: node scripts/design-shots-games.mjs ...
import { createRequire } from 'node:module'; const { chromium } = createRequire(process.cwd() + '/')('playwright');
import { spawn } from 'node:child_process';
const port = 4302;
const srv = spawn('node', ['tests/serve.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const only = process.argv.slice(2);
const OUT = 'docs/design/';
for (const [w, h] of [[390, 780], [1280, 720]]) {
  for (const game of ['racer', 'horde', 'gruppetto']) {
    if (only.length && !only.includes(game)) continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('lang', localStorage.getItem('lang') || 'it'); } catch {} });
    await p.addInitScript({ path: process.cwd() + '/tests/fake-ble.js' });
    await p.goto(`http://127.0.0.1:${port}/index.html`);
    await p.click('#connectTrainer'); await p.waitForTimeout(800);
    await p.click('#openGame'); await p.click(`[data-game=${game}]`);
    await p.waitForFunction(() => /menu|select/.test(window.__game?.state || ''), null, { timeout: 120000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}${game}-menu-${w}x${h}.png` });
    // avvio
    if (game === 'racer') { await p.evaluate(() => { window.__game.selT = 1; window.__game.input(1); }); await p.waitForFunction(() => window.__game.state === 'race', null, { timeout: 60000 }); }
    else { await p.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); }); await p.waitForTimeout(500); }
    await p.waitForTimeout(1500);
    // più messaggi insieme
    await p.evaluate(() => {
      const g = window.__game; const T = (k) => k;
      g.say('SPRINT 1° · +20 punti', '#3ccf6a', 2.2, true);
      g.say('Una frase molto lunga per vedere se esce dallo schermo o va a capo o si riduce bene', '#ffd34d', 2.2);
      g.say('Nuova arma: Mitragliatrice a raffica pesante!', '#ff5a6a', 2.4, true);
      g.say('Scia agganciata', '#4de3ff', 1.2);
      g.say('ULTIMI 500 METRI', '#ff5a6a', 2.2, true, 3);
      if (g.pop) try { g.pop('+1 moneta lunghissima', '#ffcc33', 0, 0, 0); } catch {}
    });
    for (let i = 0; i < 4; i++) { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}${game}-play-${w}x${h}-${i}.png` }); }
    console.log(game, w, h, 'errori:', errs.slice(0, 3));
    await ctx.close();
  }
}
await b.close(); srv.kill();
