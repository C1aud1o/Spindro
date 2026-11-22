// Horde Run: la forma dell'allenamento (js/games/horde-plan.js) rispetta docs/games/DESIGN-RULES.md §1. Logica pura, senza browser.
import { test, expect } from '@playwright/test';
import { DURATIONS, LEVELS, WARM_S, COOL_S, buildPlan, targetPct, targetW, starsFor } from '../js/games/horde-plan.js';

test('piano: durate 5/10/20 min, avvio 45–60 s, defaticamento 30 s, tratti in % FTP nelle fasce del documento', () => {
  expect(DURATIONS).toEqual([300, 600, 1200]);
  expect(LEVELS.map((l) => l.k)).toEqual([-0.1, 0, 0.1]);
  for (const total of DURATIONS) {
    const p = buildPlan(total);
    expect(p.segs[0].kind).toBe('warm'); expect(WARM_S).toBeGreaterThanOrEqual(45); expect(WARM_S).toBeLessThanOrEqual(60);
    expect(p.segs.at(-1)).toMatchObject({ kind: 'cool', t1: total }); expect(COOL_S).toBe(30);
    // i tratti si susseguono senza buchi
    p.segs.forEach((s, i) => { if (i) expect(s.t0).toBeCloseTo(p.segs[i - 1].t1, 6); });
    for (const s of p.segs) {
      const len = s.t1 - s.t0;
      if (s.kind === 'rest') { expect(s.pct).toBeGreaterThanOrEqual(0.5); expect(s.pct).toBeLessThanOrEqual(0.65); }
      if (s.kind === 'pace') { expect(s.pct).toBeGreaterThanOrEqual(0.75); expect(s.pct).toBeLessThanOrEqual(0.9); }
      if (s.kind === 'effort') { expect(s.pct).toBeGreaterThanOrEqual(0.95); expect(s.pct).toBeLessThanOrEqual(1.1); }
      if (s.kind === 'sprint') { expect(s.pct).toBeGreaterThanOrEqual(1.3); expect(len).toBeGreaterThanOrEqual(5); expect(len).toBeLessThanOrEqual(15); }
    }
    // mai più di 90 s di sforzo sopra soglia (sforzo + scatto) senza almeno 40 s di recupero... o proprio senza arrivarci
    let run = 0;
    for (const s of p.segs) { if (s.kind === 'effort' || s.kind === 'sprint') { run += s.t1 - s.t0; expect(run).toBeLessThanOrEqual(90); } else run = 0; }
    // la partita finisce con uno sforzo più duro dell'inizio e con un Custode
    const efforts = p.segs.filter((s) => s.kind === 'effort');
    expect(efforts.at(-1).pct).toBeGreaterThan(efforts[0].pct);
    expect(p.bossWaves.at(-1)).toBe(p.N);
  }
  expect(buildPlan(300).N).toBe(4); expect(buildPlan(600).N).toBe(7); expect(buildPlan(1200).N).toBe(12);
});

test('livelli: ±10 % sul livello e nient\'altro; il recupero non cambia; i watt sono % × FTP', () => {
  const eff = buildPlan(300).segs.find((s) => s.kind === 'effort');
  expect(targetPct(eff, -0.1)).toBeCloseTo(eff.pct - 0.1); expect(targetPct(eff, 0.1)).toBeCloseTo(eff.pct + 0.1);
  const rest = buildPlan(300).segs.find((s) => s.kind === 'rest');
  expect(targetPct(rest, 0.1)).toBe(rest.pct);
  expect(targetW(eff, 200, 0)).toBe(Math.round(200 * eff.pct));
  // nessuna difficoltà adattiva: il bersaglio non dipende da come è andata prima
  expect(targetW(eff, 200, 0, 10)).toBe(targetW(eff, 200, 0));
});

test('stelle: una per aver finito, due con metà degli sforzi, tre con l’80 %, tutti i Custodi e al massimo 3 cadute', () => {
  const s = (o) => starsFor({ done: 0, total: 5, bossKilled: 0, bossTotal: 1, ko: 0, ...o }).stars;
  expect(s({})).toBe(1); expect(s({ done: 3 })).toBe(2); expect(s({ done: 4 })).toBe(2);
  expect(s({ done: 4, bossKilled: 1 })).toBe(3); expect(s({ done: 4, bossKilled: 1, ko: 3 })).toBe(3); expect(s({ done: 4, bossKilled: 1, ko: 4 })).toBe(2);
});
