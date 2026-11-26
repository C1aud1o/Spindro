// Horde Run: la forma dell'allenamento (js/games/horde-plan.js) rispetta docs/games/DESIGN-RULES.md §1. Logica pura, senza browser.
import { test, expect } from '@playwright/test';
import { DURATIONS, LEVELS, WARM_S, COOL_S, buildPlan, targetPct, targetW, starsFor, nextStarHint, feasible, SLACK, SWITCH_S, DENSITY, GAP_K, LANES, laneX, LANE_W } from '../js/games/horde-plan.js';

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

test('stelle (senza allenamento): una per aver finito, due con almeno 4 cuori, tre con tutti e 6 o al massimo uno perso', () => {
  const s = (hp, lost) => starsFor({ hp, lost }).stars;
  expect(s(1, 9)).toBe(1); expect(s(3, 5)).toBe(1); expect(s(4, 4)).toBe(2); expect(s(5, 4)).toBe(2);
  expect(s(6, 0)).toBe(3); expect(s(5, 1)).toBe(3); expect(s(6, 5), 'tutti i cuori alla fine (cuori ripresi dai portali)').toBe(3); expect(s(4, 2)).toBe(2);
  expect(nextStarHint({ stars: 1 }).key).toBe('games.horde.res.next2'); expect(nextStarHint({ stars: 2 }).key).toBe('games.horde.res.next3'); expect(nextStarHint({ stars: 3 })).toBeNull();
});

test('corsie: tre, simmetriche; la corsia 0 è a sinistra sullo schermo (X positivo: la camera guarda +Z)', () => {
  expect(LANES).toBe(3); expect(laneX(1)).toBe(0); expect(laneX(0)).toBe(LANE_W); expect(laneX(2)).toBe(-LANE_W);
});

test('direttore: il margine è 25 % a Normale, 40 % a Facile, 10 % a Difficile; più margine = meno carico', () => {
  expect(SLACK).toEqual({ easy: 0.4, normal: 0.25, hard: 0.1 });
  expect(GAP_K.easy).toBeGreaterThan(GAP_K.normal); expect(GAP_K.normal).toBeGreaterThan(GAP_K.hard);
  // in recupero pochi nemici, nello sforzo fitto; mai più di 3,6 s fra due ingressi (regola 2: niente più di 5 s senza eventi)
  for (const k of ['warm', 'pace', 'effort', 'sprint', 'rest']) expect(DENSITY[k].gap[1] * GAP_K.easy).toBeLessThanOrEqual(3.7);
  expect(DENSITY.rest.gap[0]).toBeGreaterThan(DENSITY.effort.gap[1]); expect(DENSITY.effort.pair).toBeGreaterThan(DENSITY.pace.pair); expect(DENSITY.rest.pair).toBe(0);
});

test('feasible: il tempo per ripulire (tiro + cambi di corsia) deve stare nel margine, con i nemici che arrivano', () => {
  const o = { lane: 1, slack: 0.25 };
  expect(feasible([], o)).toBe(true);
  // un nemico nella propria corsia: serve 1 s di tiro, arriva fra 3 s → 1 / 0,75 = 1,33 s ≤ 3
  expect(feasible([{ a: 3, r: 0, w: 1, lane: 1 }], o)).toBe(true);
  expect(feasible([{ a: 1.2, r: 0, w: 1, lane: 1 }], o), 'con il margine del 25 % 1 s di tiro non entra in 1,2 s').toBe(false);
  // cambio di corsia: costa SWITCH_S (gonfiato dal margine)
  const need = (1 + SWITCH_S) / 0.75;
  expect(feasible([{ a: need + 0.05, r: 0, w: 1, lane: 2 }], o)).toBe(true); expect(feasible([{ a: need - 0.05, r: 0, w: 1, lane: 2 }], o)).toBe(false);
  // due nemici in corsie diverse che arrivano insieme: uno dei due si perde
  expect(feasible([{ a: 2, r: 0, w: 0.5, lane: 0 }, { a: 2.1, r: 0, w: 0.5, lane: 2 }], o)).toBe(false);
  expect(feasible([{ a: 2, r: 0, w: 0.5, lane: 0 }, { a: 6, r: 0, w: 0.5, lane: 2 }], o)).toBe(true);
  // più margine = più difficile far entrare lo stesso carico; meno margine = più facile
  const J = [{ a: 1.5, r: 0, w: 1, lane: 1 }];
  expect(feasible(J, { lane: 1, slack: 0.1 })).toBe(true); expect(feasible(J, { lane: 1, slack: 0.4 })).toBe(false);
  // un nemico non ancora a tiro (r > 0) non si può colpire prima
  expect(feasible([{ a: 3, r: 2.5, w: 1, lane: 1 }], o)).toBe(false);
});
