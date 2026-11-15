// Foto di Planata, Mattoni e Pedal Strike (menu, partita con più messaggi, fine) in docs/design/ e in un'altra cartella per le prove.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/design-shots-d8.mjs [planata|mattoni|shooter] [--lang=it,de] [--out=cartella]
import { createRequire } from 'node:module'; const { chromium } = createRequire(process.cwd() + '/')('playwright');
import { spawn } from 'node:child_process'; import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const only = args.filter((a) => !a.startsWith('--')); const langs = opt('lang', 'it,de').split(','); const OUT = opt('out', 'docs/design/'); mkdirSync(OUT, { recursive: true });
const port = 4303;
const srv = spawn('node', ['tests/serve.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const MSG = {
  it: ['PUNTEGGIO RADDOPPIATO · +20 punti', 'Una frase molto lunga per vedere se esce dallo schermo o va a capo o si riduce bene', 'Nuova arma: Mitragliatrice a raffica pesante!', 'Anello preso'],
  de: ['DOPPELTE PUNKTE · +20 Punkte', 'Ein sehr langer Satz, um zu sehen, ob er aus dem Bildschirm läuft oder umbricht oder schrumpft', 'Neue Waffe: Schwerer Dauerfeuer-Maschinengewehr!', 'Donnerstagnachmittagsfahrradringe'],
};
for (const lang of langs) for (const [w, h] of [[390, 780], [1280, 720]]) for (const game of ['planata', 'mattoni', 'shooter']) {
  if (only.length && !only.includes(game)) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript((lang) => { try { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('lang', lang); } catch {} }, lang);
  await p.addInitScript({ path: process.cwd() + '/tests/fake-ble.js' });
  await p.goto(`http://127.0.0.1:${port}/index.html`);
  await p.click('#connectTrainer'); await p.waitForTimeout(800);
  await p.click('#openGame'); await p.click(`[data-game=${game}]`);
  await p.waitForFunction(() => /menu|select/.test(window.__game?.state || ''), null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  const tag = `${game}-${lang}-${w}x${h}`;
  await p.screenshot({ path: `${OUT}${tag}-menu.png` });
  await p.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
  await p.waitForTimeout(game === 'shooter' ? 4500 : 1500);
  await p.evaluate((m) => { const g = window.__game; g.say(m[0], '#3ccf6a', 2.2, true); g.say(m[1], '#ffd34d', 2.2); g.say(m[2], '#ff5a6a', 2.4, true); g.say(m[3], '#4de3ff', 1.2); g.pop?.(m[3], '#ffcc33', 0, 2, 5); }, MSG[lang]);
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}${tag}-play${i}.png` }); }
  // fine partita
  await p.evaluate(() => { const g = window.__game; try { if (g.state !== 'over') { if (g.die) g.die(); else if (g.gameOver) g.gameOver(); else if (g.end) g.end(); } } catch (e) { console.log(e.message); } });
  await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}${tag}-over.png` });
  console.log(tag, 'stato', await p.evaluate(() => window.__game.state), 'errori:', errs.slice(0, 3));
  await ctx.close();
}
await b.close(); srv.kill();
