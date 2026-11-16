// BOT HARNESS: `npm run game:check -- <id> [options]`
//
// Plays one game with the simulated rider (the demo rider, js/games/demo.js) at the four standard power levels of
// docs/games/DESIGN-RULES.md §5 (0.6 / 0.8 / 1.0 / 1.2 × FTP, FTP 200, session at the menu's first length (5 minutes for the standard menu), level Normal, seeded with
// kit/rng.js), prints the table the design rules ask for and exits 1 with a clear message for every rule that is broken.
//
//   <id>            a game id from js/games/registry.js
//   --levels a,b    power levels, default 0.6,0.8,1,1.2
//   --seconds N     stop each run after N seconds of game time (quick look; stars are then not checked)
//   --seed N        random seed (default 1234)
//   --ftp W         rider's FTP (default 200)
//   --json          print the table as JSON
//
// The game runs on a fake clock (30 frames per game second), so a 5-minute session takes seconds, not minutes; the 3D
// renderer is skipped after the first 90 frames, which are timed at 4× CPU slowdown (software GL: only a hint, see below).
// What is read from the game: `state` ('results' at the end), `result.stars`, `eventStats()` -> { first, maxGap, perMin }.
// A game without eventStats() is measured from its sound effects and progress events instead (anything but UI sounds).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './static-server.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--json'].includes(args[i - 1])));
const registry = readFileSync(new URL('../js/games/registry.js', import.meta.url), 'utf8');
const ids = [...registry.matchAll(/defineGame\(\{ id: '(\w+)'/g)].map((m) => m[1]);
if (!id || !ids.includes(id)) { console.error(`Usage: npm run game:check -- <id> [--levels 0.6,1] [--seconds 60] [--json]\nGames: ${ids.join(', ')}`); process.exit(2); }
const LEVELS = String(opt('levels', '0.6,0.8,1,1.2')).split(',').map(Number);
const FTP = Number(opt('ftp', 200)); const SEED = Number(opt('seed', 1234)); const LIMIT = Number(opt('seconds', 0));
const EXPECT = { 0.6: [1, 1], 0.8: [1, 2], 1: [2, 3], 1.2: [3, 3] }; // stars expected at each level (DESIGN-RULES §5)
const MAX_FIRST = 8; const MAX_GAP = 5; const MAX_FRAME_MS = 22; // seconds, seconds, ms

// ---- runs inside the page ------------------------------------------------------------------------------------------
function installClock() { // fake clock: the page runs on frames we pump ourselves, after the game has loaded (auto mode until then)
  let now = performance.now(); const queue = [];
  window.__clock = { manual: false, step: 1000 / 30 };
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  performance.now = () => now;
  const frame = (dt) => { now += dt; const cbs = queue.splice(0); for (const cb of cbs) cb(now); };
  window.__pump = (n, dt = window.__clock.step) => { for (let i = 0; i < n; i++) frame(dt); };
  setInterval(() => { if (!window.__clock.manual) frame(1000 / 60); }, 16);
}
async function botRun({ mult, ftp, limit }) {
  const g = window.__game; const d = window.__demo; const clock = window.__clock; const hooks = g.hooks;
  clock.manual = true; d.set({ power: ftp * mult, cadence: 90, ftp });
  // fallback event log (games without eventStats): anything the rider sees or hears that is not UI feedback
  const UI = new Set(['select', 'shiftUp', 'shiftDown', 'beep']); const evs = []; let t0 = null;
  const sfx = g.audio?.sfx?.bind(g.audio); if (sfx) g.audio.sfx = (n, ...r) => { if (t0 !== null && !UI.has(n)) evs.push((performance.now() - t0) / 1000); return sfx(n, ...r); };
  const pe = hooks.progress?.event?.bind(hooks.progress); if (pe) hooks.progress.event = (...r) => { if (t0 !== null) evs.push((performance.now() - t0) / 1000); return pe(...r); };
  const rs = hooks.runStart; hooks.runStart = (...r) => { t0 = performance.now(); return rs?.(...r); };
  g.menu.durIdx = 0; g.menu.level = 1; g.menu.age = 1; // 5 minutes, Normal
  g.menu.start();
  let frames = 0; let timed = 0; let ms = 0; const wall = () => Date.now();
  const budget = (limit || 1500) * 30 + 30 * 40;
  // phase A: 90 frames with rendering, timed in wall-clock ms; phase B: rendering skipped, game logic only
  const w0 = wall();
  window.__pump(90); ms = wall() - w0; timed = 90; frames = 90;
  if (g.stage?.render) g.stage.render = () => {};
  while (g.state !== 'results' && g.state !== 'error' && frames < budget) {
    window.__pump(30); frames += 30;
    if (limit && t0 !== null && (performance.now() - t0) / 1000 >= limit) break;
  }
  let es = typeof g.eventStats === 'function' ? g.eventStats() : null;
  if (es && limit && Array.isArray(g.evLog)) { // partial run: only the part that was played counts
    const ts = g.evLog.map((e) => e.t).filter((x) => x <= limit).sort((a, b) => a - b); let gap = 0; let p = 0; for (const x of ts) { gap = Math.max(gap, x - p); p = x; }
    es = { first: ts[0] ?? Infinity, maxGap: Math.max(gap, limit - p), perMin: ts.length / (limit / 60) };
  }
  const ts = evs.sort((a, b) => a - b); let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; }
  const dur = t0 === null ? 0 : (performance.now() - t0) / 1000; maxGap = Math.max(maxGap, dur - prev);
  const ev = es ? { first: es.first, maxGap: es.maxGap, perMin: es.perMin, from: 'eventStats()' } : { first: ts[0] ?? Infinity, maxGap, perMin: dur > 0 ? ts.length / (dur / 60) : 0, from: 'sfx+progress' };
  return { state: g.state, stars: g.result?.stars ?? null, secs: Math.round(dur), ev, frameMs: ms / timed, started: t0 !== null };
}

// ---- driver --------------------------------------------------------------------------------------------------------
const { server, url } = await startServer(0);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const rows = []; const problems = [];
try {
  for (const mult of LEVELS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(installClock);
    await page.addInitScript(([seed, ftp]) => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('mode', 'gears'); localStorage.setItem('ftp', String(ftp)); localStorage.setItem('gameQuality', 'medium'); localStorage.setItem('lang', 'en'); } catch { /* no storage */ } window.__spindroSeed = seed; }, [SEED, FTP]);
    await page.goto(`${url}/index.html?game=${id}&demo=1`);
    try { await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120_000 }); } catch { problems.push(`${mult}×: the game never reached the menu (state "${await page.evaluate(() => window.__game?.state)}"). ${errors[0] || ''}`); await ctx.close(); continue; }
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await page.evaluate(botRun, { mult, ftp: FTP, limit: LIMIT });
    await ctx.close();
    rows.push({ mult, ...r, errors });
  }
} finally { await browser.close(); server.close(); }

// ---- verdicts ------------------------------------------------------------------------------------------------------
for (const r of rows) {
  const tag = `${r.mult}× FTP`;
  if (!r.started) problems.push(`${tag}: the run never started (menu.start() did not call hooks.runStart()). Call this.hooks.runStart?.() when play begins.`);
  if (r.errors.length) problems.push(`${tag}: JavaScript error in the page: ${r.errors[0]}`);
  if (r.state === 'error') problems.push(`${tag}: the game ended in state "error".`);
  if (!LIMIT && r.state !== 'results') problems.push(`${tag}: the run did not reach state "results" within the session (state "${r.state}"). A game must always end on the results screen.`);
  if (r.started && r.ev.first > MAX_FIRST) problems.push(`${tag}: first event after ${Number.isFinite(r.ev.first) ? r.ev.first.toFixed(1) : 'never'} s (rule: within ${MAX_FIRST} s). Give the rider something to do at the start.`);
  if (r.started && r.ev.maxGap > MAX_GAP) problems.push(`${tag}: longest gap without an event ${r.ev.maxGap.toFixed(1)} s (rule: never more than ${MAX_GAP} s). Add an event (target, reward, obstacle) in the gap${r.ev.from === 'eventStats()' ? '' : ', and call this.ev(kind) so eventStats() sees it'}.`);
  const exp = EXPECT[r.mult];
  if (!LIMIT && exp && r.state === 'results' && (r.stars == null || r.stars < exp[0] || r.stars > exp[1])) problems.push(`${tag}: ${r.stars ?? 'no'} stars, expected ${exp[0] === exp[1] ? exp[0] : `${exp[0]}-${exp[1]}`}. Stars must come from result.stars; see the star criteria in DESIGN-RULES §1.`);
  if (r.frameMs > MAX_FRAME_MS) console.warn(`note: ${tag}: ${r.frameMs.toFixed(0)} ms/frame at 4× CPU slowdown on software GL: informational only (rule: < ${MAX_FRAME_MS} ms on a real GPU).`);
}
if (flag('json')) console.log(JSON.stringify(rows.map(({ errors, ...r }) => r), null, 1));
else {
  const f = (x, n = 1) => (Number.isFinite(x) ? x.toFixed(n) : '—');
  console.log(`\ngame:check ${id}  ·  FTP ${FTP} W  ·  seed ${SEED}  ·  ${LIMIT ? `first ${LIMIT} s of the run` : 'full session at the first length of the menu (5 min in most games), level Normal'}\n`);
  console.log('| × FTP | stars | expected | first event (s) | longest gap (s) | events/min | game s | ms/frame |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) { const e = EXPECT[r.mult]; console.log(`| ${r.mult} | ${r.stars ?? '—'} | ${e ? (e[0] === e[1] ? e[0] : `${e[0]}-${e[1]}`) : '—'} | ${f(r.ev.first)} | ${f(r.ev.maxGap)} | ${f(r.ev.perMin)} | ${r.secs} | ${f(r.frameMs, 0)} |`); }
  console.log(`\nevents read from: ${rows[0]?.ev.from ?? '—'}\n`);
}
if (problems.length) { console.error(`✗ ${problems.length} rule${problems.length > 1 ? 's' : ''} broken:\n${problems.map((p) => `  - ${p}`).join('\n')}`); process.exit(1); }
console.log('✓ all rules respected');
