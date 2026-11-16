// QA exploration: visits every screen/state over the viewport × language matrix, saves screenshots and prints audit findings.
// Usage: node tests/serve.mjs &  then  node scripts/qa/explore.mjs [--vp s360,s390] [--lang de,en] [--scene home,settings]
// Screenshots go to $QA_OUT (default /tmp/qa-shots), never into the repo.
import * as L from './lib.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const AXE = process.argv.includes('--axe') ? readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8') : null;

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1].split(',') : d; };
const VPS = arg('vp', Object.keys(L.VIEWPORTS)); const LANGS = arg('lang', L.LANGS); const ONLY = arg('scene', null);

const DAY = 864e5;
const series = (n, base) => Array.from({ length: n }, (_, i) => Math.round(base + 60 * Math.sin(i / 7)));
const rides = (n) => Array.from({ length: n }, (_, i) => ({ t: Date.now() - (n - i) * 2.3 * DAY, dur: 1800 + i * 300, km: +(14 + i * 2.5).toFixed(2), avgW: 150 + i * 4, kj: 270 + i * 60, np: 170 + i * 3, maxW: 400 + i * 5, best: { 5: 520, 60: 300 + i, 300: 240, 1200: 200 + i }, avgHr: 140, maxHr: 170, series: series(120 + i * 30, 160) }));
const BIG = { ftp: '450', mass: '99', hrMax: '210' };
const LONG_WK = { id: 'my-1', name: 'Zwei mal zwanzig Minuten Schwelle mit langer Erholung dazwischen XL', tag: '37 min', desc: 'Eine lange Beschreibung, die über mehrere Zeilen laufen darf und trotzdem nichts sprengen soll.', custom: true, steps: [{ d: 600, p: 0.55, label: 'Aufwärmen mit einem sehr langen Namen für die Stufe' }, { d: 1200, p: 0.95, label: 'Schwelle' }, { d: 300, p: 0.5, label: 'Rest' }] };
const planSeed = { id: 'piuftp', start: Math.round(Date.now() / DAY) - 9, done: { '0.0': Math.round(Date.now() / DAY) - 9 }, skipped: {}, moved: {} };

const scenes = {
  async home(p, tag) { await L.shot(p, tag, 'home'); return L.audit(p, 'home'); },
  async 'home-trainer'(p, tag) { await L.connectTrainer(p); await p.waitForTimeout(700); await L.shot(p, tag, 'home-trainer'); return L.audit(p, 'home-trainer'); },
  async 'home-click'(p, tag) { await L.connectTrainer(p); await L.connectClick(p); await p.waitForTimeout(700); await L.shot(p, tag, 'home-click'); return L.audit(p, 'home-click'); },
  async ride(p, tag) { await L.connectTrainer(p); await p.click('#startStop'); await p.evaluate(() => window.__fakeBle.setPower(1234)); await p.waitForTimeout(1500); await L.shot(p, tag, 'ride'); return L.audit(p, 'ride'); },
  async 'ride-click'(p, tag) { await L.connectTrainer(p); await L.connectClick(p); await p.click('#startStop'); await p.waitForTimeout(1200); await L.shot(p, tag, 'ride-click'); return L.audit(p, 'ride-click'); },
  async 'ride-workout'(p, tag) {
    await L.connectTrainer(p); await p.click('#openWorkouts'); await p.waitForTimeout(500);
    await L.shot(p, tag, 'workout-list'); const a = await L.audit(p, 'workout-list');
    await p.locator('#workoutList button, #workoutList [data-wk]').first().click().catch(() => {}); await p.waitForTimeout(500);
    await L.shot(p, tag, 'ride-workout'); return [...a, ...(await L.audit(p, 'ride-workout'))];
  },
  async finish(p, tag) { await L.connectTrainer(p); await p.click('#startStop'); await p.waitForTimeout(2500); await p.click('#finishRide'); await p.waitForTimeout(600); await L.shot(p, tag, 'finish'); return L.audit(p, 'finish'); },
  async modes(p, tag) { await p.click('#moreModes').catch(() => {}); await p.waitForTimeout(500); await L.shot(p, tag, 'modes'); return L.audit(p, 'modes'); },
  async settings(p, tag) {
    await p.click('#openSettings'); await p.waitForTimeout(600); const out = [];
    for (let i = 0; i < 14; i++) {
      const more = await p.evaluate((i) => { const s = document.querySelector('#settingsSheet .sheet-body'); s.scrollTop = i * s.clientHeight * 0.8; return s.scrollTop + s.clientHeight < s.scrollHeight - 2; }, i);
      await p.waitForTimeout(100); await L.shot(p, tag, `settings-${i}`); out.push(...await L.audit(p, 'settings')); if (!more) break;
    }
    return [...new Set(out)];
  },
  async history(p, tag) { await p.click('#openHistoryCard'); await p.waitForTimeout(700); await p.locator('#historySheet summary').first().click().catch(() => {}); await p.waitForTimeout(300); await L.shot(p, tag, 'history'); return L.audit(p, 'history'); },
  async plans(p, tag) { await p.click('#openWorkouts'); await p.waitForTimeout(400); await p.click('#tabPlans'); await p.waitForTimeout(500); await L.shot(p, tag, 'plans'); return L.audit(p, 'plans'); },
  async editor(p, tag) { await p.click('#openWorkouts'); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#workoutSheet [data-new], #workoutSheet [data-edit], #workoutSheet .link')?.click()); await p.waitForTimeout(500); await L.shot(p, tag, 'editor'); return L.audit(p, 'editor'); },
  async consent(p, tag) { await L.shot(p, tag, 'consent'); return L.audit(p, 'consent'); },
  async devices(p, tag) { await p.click('#deviceBar'); await p.waitForTimeout(600); await L.shot(p, tag, 'devices'); return L.audit(p, 'devices'); },
  async games(p, tag) { await p.click('#openGame'); await p.waitForTimeout(900); await L.shot(p, tag, 'games'); return L.audit(p, 'games'); },
};
const SEEDS = { // per-scene storage seeds
  home: { rideHistory: rides(12), plan: planSeed, customWorkouts: [LONG_WK], ...BIG },
  'home-trainer': { rideHistory: rides(12), ...BIG }, 'home-click': { mode: 'gears', ...BIG }, ride: { ...BIG }, 'ride-click': { mode: 'gears', ...BIG },
  'ride-workout': { customWorkouts: [LONG_WK], ...BIG }, finish: { rideHistory: rides(5) }, modes: {}, settings: {}, history: { rideHistory: rides(40), ...BIG },
  plans: { plan: planSeed }, editor: { customWorkouts: [LONG_WK] }, consent: { analytics: undefined }, devices: {}, games: {},
};

const b = await L.launch(); const findings = {};
for (const vp of VPS) for (const lang of LANGS) for (const [name, fn] of Object.entries(scenes)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const seed = { ...SEEDS[name] }; for (const k of Object.keys(seed)) if (seed[k] === undefined) delete seed[k];
  const page = await L.newPage(b, { vp, lang, seed: name === 'consent' ? { ...seed } : seed });
  if (name === 'consent') { await page.evaluate(() => localStorage.removeItem('analytics')); await page.reload(); await page.waitForTimeout(600); }
  let res = [];
  try { res = await fn(page, `${vp}_${lang}`); } catch (e) { res = [`SCENE ERROR ${name}: ${e.message.split('\n')[0]}`]; }
  if (AXE) { try { await page.evaluate(AXE); const v = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => r.violations.map((x) => `axe ${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`))); res = [...res, ...v.map((m) => `${name} ${m}`)]; } catch (e) { res.push('axe failed ' + e.message.split('\n')[0]); } }
  const log = page.qaLog.filter((l) => !/Service Worker registration blocked/.test(l));
  for (const m of [...res, ...log]) (findings[m.replace(/^\S+ /, '').replace(/\d+x\d+|\d+/g, '#')] ||= { msg: m, where: [] }).where.push(`${vp}/${lang}/${name}`);
  await page.context().close();
}
await b.close();
for (const { msg, where } of Object.values(findings)) console.log(`${msg}\n     ← ${where.length > 6 ? where.slice(0, 6).join(', ') + ` +${where.length - 6}` : where.join(', ')}`);
console.log(`\n${Object.keys(findings).length} distinct findings`);
