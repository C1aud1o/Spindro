// Bots of Horde Run (three lanes): proves that + / − matter. Policies:
//   lane  always goes to the lane of the enemy that will arrive first
//   idle  never presses anything
//   late  like lane, but reacts 0.6 s after the threat appears and makes a wrong move 10 % of the time
// The game runs on a fixed 1/30 s step (the browser does not render: only the game logic), the trainer sits exactly on the target.
//
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-bot.mjs [--policies lane,idle,late] [--levels easy,normal,hard]
//                                                                          [--seeds 1,2,3,4,5] [--sec 300] [--ftp 200] [--dur 0] [--json]
// Prints one row per (policy, level): hearts at the end (mean / min), hearts lost, lane changes per minute, longest time without
// events, first event. Exits 1 if the proof of docs/games/DESIGN-RULES.md is not met (see `verdicts`).
import { chromium } from '@playwright/test';
import { startServer } from './static-server.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const list = (k, d) => String(opt(k, d)).split(',');
const POLICIES = list('policies', 'lane,idle,late'); const LEVELS = list('levels', 'easy,normal,hard');
const SEEDS = list('seeds', '1,2,3,4,5').map(Number); const SEC = Number(opt('sec', 300)); const FTP = Number(opt('ftp', 200)); const DUR = Number(opt('dur', 0));
const JSON_OUT = args.includes('--json');

// ---- runs inside the page -------------------------------------------------------------------------------------------------
function simulate({ policy, level, seed, sec, ftp, dur }) {
  const g = window.__game; g.active = false; window.__spindroSeed = seed;
  g.durIdx = dur; g.lvlIdx = ['easy', 'normal', 'hard'].indexOf(level);
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, stats: () => ({ power: g.tgtW || ftp * 0.6, cadence: 85 }), speedKmh: () => 30, setGrade() {}, setTarget: (w) => w };
  g.reset(); g.begin();
  let s = (seed * 2654435761) >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const dt = 1 / 30; let n = 0; let lastTarget = null; let seenAt = 0; let want = g.lane; let hold = false; let fix = false; let wrongAt = 0;
  const firstArriver = () => { let best = null; let bt = Infinity; for (const e of g.enemies) { if (e.dead) continue; const ta = (e.z - g.z) / (3.6 + e.def.speed); if (ta < bt) { bt = ta; best = e; } } return best; };
  const steer = (lane) => { if (lane > g.lane) g.input(1); else if (lane < g.lane) g.input(-1); };
  const act = {
    idle: () => {},
    lane: () => { const l = g.threatLane(); if (l >= 0) steer(l); },
    late: () => { // sees the threat, reacts 0.6 s later; 10 % of the time goes the wrong way first and corrects after another 0.6 s
      const e = firstArriver(); const now = n * dt;
      if (e !== lastTarget) { lastTarget = e; seenAt = now; hold = false; fix = false; }
      if (!e) return;
      if (!hold && now - seenAt >= 0.6) { hold = true; wrongAt = now; want = e.lane; if (rnd() < 0.1) { want = [0, 1, 2].filter((l) => l !== e.lane)[Math.floor(rnd() * 2)]; fix = true; } }
      if (hold && fix && now - wrongAt >= 0.6) { want = e.lane; fix = false; }
      if (hold) steer(want);
    },
  }[policy];
  const limit = (sec + 5) * 30;
  while (g.state === 'play' && n < limit) { act(); g.update(dt); n++; }
  const es = g.eventStats();
  return { state: g.state, secs: n / 30, hp: g.hp, lost: g.lost, ko: g.ko, stars: g.result?.stars ?? null, moves: g.moves, perMin: g.moves / (n / 30 / 60), first: es.first, maxGap: es.maxGap, events: es.perMin, kills: g.kills, weapon: g.weapon, allies: g.allies.length, effortsDone: g.effortsDone, effortsTotal: g.effortsTotal, boss: `${g.bossKilled}/${g.plan.bossWaves.length}` };
}

// ---- driver ---------------------------------------------------------------------------------------------------------------
const { server, url } = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((ftp) => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', String(ftp)); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('lang', 'en'); } catch { /* no storage */ } }, FTP);
await page.goto(`${url}/index.html?game=horde&demo=1`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120_000 });
const rows = [];
for (const policy of POLICIES) for (const level of LEVELS) {
  if (policy !== 'lane' && level !== 'normal') continue; // the other policies are measured at Normal only
  const runs = [];
  for (const seed of SEEDS) runs.push(await page.evaluate(simulate, { policy, level, seed, sec: SEC, ftp: FTP, dur: DUR }));
  const avg = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  rows.push({ policy, level, runs, hp: avg('hp'), hpMin: Math.min(...runs.map((r) => r.hp)), lost: avg('lost'), perMin: avg('perMin'), maxGap: Math.max(...runs.map((r) => r.maxGap)), first: Math.max(...runs.map((r) => r.first)), done: runs.every((r) => r.state === 'results') });
  if (!JSON_OUT) console.log(`${policy.padEnd(5)} ${level.padEnd(6)} hearts ${avg('hp').toFixed(2)} (min ${Math.min(...runs.map((r) => r.hp))}) lost ${avg('lost').toFixed(1)} KO ${avg('ko').toFixed(1)} · lane changes/min ${avg('perMin').toFixed(1)} · longest idle ${Math.max(...runs.map((r) => r.maxGap)).toFixed(1)} s · first ${Math.max(...runs.map((r) => r.first)).toFixed(1)} s · ${runs.map((r) => `${r.hp}/${r.lost}`).join(' ')}  [${runs.map((r) => `w${r.weapon}a${r.allies}`).join(' ')}]`);
}
await browser.close(); server.close();
if (JSON_OUT) console.log(JSON.stringify(rows, null, 1));
if (errors.length) { console.error('page errors:', errors[0]); process.exit(1); }

const get = (p, l = 'normal') => rows.find((r) => r.policy === p && r.level === l);
const bad = []; const L = get('lane'); const I = get('idle'); const T = get('late');
if (L) { if (L.hp < 5) bad.push(`lane bot: ${L.hp.toFixed(2)} hearts on average (need ≥ 5)`); if (L.hpMin < 4) bad.push(`lane bot: ${L.hpMin} hearts in the worst run (need ≥ 4)`); if (L.perMin < 8 || L.perMin > 30) bad.push(`lane bot: ${L.perMin.toFixed(1)} lane changes/min (need 8–30)`); if (L.maxGap > 5) bad.push(`longest idle ${L.maxGap.toFixed(1)} s (need ≤ 5)`); if (L.first > 8) bad.push(`first event ${L.first.toFixed(1)} s (need ≤ 8)`); }
if (I && I.lost < 3) bad.push(`idle bot loses only ${I.lost.toFixed(1)} hearts (need ≥ 3)`);
if (T && T.hp < 4) bad.push(`late bot: ${T.hp.toFixed(2)} hearts (need ≥ 4)`);
const E = get('lane', 'easy'); const H = get('lane', 'hard');
if (E && L && H && !(E.hp >= L.hp && L.hp >= H.hp)) bad.push(`levels not ordered: easy ${E.hp.toFixed(2)} ≥ normal ${L.hp.toFixed(2)} ≥ hard ${H.hp.toFixed(2)}`);
if (rows.some((r) => !r.done)) bad.push('a run did not reach the results screen');
if (bad.length) { console.error(`✗ ${bad.length} problem${bad.length > 1 ? 's' : ''}:\n  - ${bad.join('\n  - ')}`); process.exit(1); }
console.log('✓ proof holds');
