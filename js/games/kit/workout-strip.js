// ONE workout strip for every game and the video ride: the same position, the same typography (Barlow Condensed, flat),
// the same content, readable at a glance on a portrait phone and on a TV.
//
//   ┌──────────────────────────────────────────────────────────┐
//   │▌ EFFORT · Threshold 2/4            250 W  108 % FTP      │  step: kind + label, target
//   │  0:16 left        12:30 / 30:00      NEXT 150 W · 2:00   │  time left, elapsed/total, next step
//   │  ▁▁▂▂▅▅▅▂▂▇▇▇▂▂▁▁                                        │  whole workout, current position
//   └──────────────────────────────────────────────────────────┘
//
// With a workout it is fed by the workout; without one by the game's own plan (same fields: kind, target, time left, next).
// Games do NOT draw their own target block any more. Call `stripBottom(W, H)` to know where the game's own HUD can start.
//
// Usage in a game's drawHud (state 'play' or 'cool'):
//   const s = buildStrip(this.stripSource());               // see stripFromPlan() below for the horde-family plans
//   const bottom = drawWorkoutStrip(ctx, W, H, s);          // returns the y where the strip ends (+ a small gap)
// `info` (all fields optional except kind and target):
//   { kind, label, target, pct, left, next: { watts, dur, kind, label } | null, elapsed, total, track: [{ t0, t1, kind, pct }],
//     bias (1 = none), wk (bool: a workout is running) }
import { t } from '../../i18n.js';
import { uiScale, panel } from './hud.js';

export const STRIP_FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
export const KIND_COLOR = { warm: '#a6f08f', pace: '#ffd34d', effort: '#ff9f43', sprint: '#ff5a6a', recovery: '#4de3ff', cool: '#a6f08f' };
const INK = '#0F0F0D'; const LIME = '#D9FF3D';

// kinds of every game plan → the six strip kinds (horde family: warm | pace | effort | sprint | rest | cool;
// workout: warm | easy | tempo | effort | sprint | recovery | cool; strike: warm | rec | effort | mini | boss | sprint | cool)
export function stripKind(k) {
  switch (k) {
    case 'warm': return 'warm';
    case 'cool': return 'cool';
    case 'rest': case 'rec': case 'recovery': case 'recover': return 'recovery';
    case 'sprint': case 'kick': return 'sprint';
    case 'effort': case 'mini': case 'boss': case 'final': case 'break': case 'climb': case 'close': case 'hold': return 'effort';
    default: return 'pace'; // pace, easy, tempo, start...
  }
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

// ---------- the model (pure) ----------
// Turns a list of normalised segments into everything the strip shows.
//   segs: [{ t0, t1, kind, watts, label?, stepStart?, stepEnd? }]  (watts = target of the segment; stepStart/stepEnd = the
//   whole workout step a split piece belongs to), el: seconds of the session, total: its length.
export function buildStrip({ segs, el, total, target, ftp, label = null, bias = 1, wk = false } = {}) {
  if (!segs || !segs.length) return null;
  let i = segs.findIndex((s) => el >= s.t0 && el < s.t1); if (i < 0) i = el >= segs[segs.length - 1].t1 ? segs.length - 1 : 0;
  const s = segs[i]; const kind = stripKind(s.kind);
  const stepEnd = s.stepEnd ?? s.t1; const stepStart = s.stepStart ?? s.t0;
  // next: the first piece after this step whose target or kind is different
  let nx = null; for (let j = i + 1; j < segs.length; j++) if (segs[j].t0 >= stepEnd - 1e-6) { nx = segs[j]; break; }
  const next = nx ? { watts: Math.round(nx.watts * bias), dur: Math.max(1, Math.round((nx.stepEnd ?? nx.t1) - nx.t0)), kind: stripKind(nx.kind), label: nx.label || null } : null;
  return {
    kind, label: label ?? s.label ?? null, target: Math.round(target ?? s.watts), pct: ftp ? Math.round((target ?? s.watts) / ftp * 100) : null,
    left: Math.max(0, stepEnd - el), stepLen: Math.max(1, stepEnd - stepStart), next, elapsed: Math.min(el, total), total,
    track: segs.map((g) => ({ t0: g.t0, t1: g.t1, kind: stripKind(g.kind), pct: ftp ? g.watts / ftp : 0.7 })), bias, wk,
  };
}
// the horde family of plans (horde, mattoni, gruppetto, planata): plan.segs with pct and kind; targetWfn(seg) → watts
export function stripFromPlan(plan, { el, ftp, target, targetWfn, bias = 1 }) {
  const segs = plan.segs.map((g) => ({ t0: g.t0, t1: g.t1, kind: g.wkKind || g.kind, watts: targetWfn(g), label: g.label || null, stepStart: g.stepStart, stepEnd: g.stepEnd }));
  return buildStrip({ segs, el, total: plan.total, target, ftp, bias, wk: !!plan.wk });
}

// ---------- layout (same everywhere) ----------
// The strip sits right under the game's own title bar (title, audio, exit). `u` is the usual UI scale (1 on a phone, up to 1.45).
export function stripBox(W, H) {
  const u = uiScale(W, H); const pad = Math.round(10 * u); const top = Math.round(56 * u);
  const h = Math.round(92 * u); const w = Math.min(W - 2 * pad, Math.round(760 * u));
  return { x: Math.round((W - w) / 2), y: top, w, h, u, bottom: top + h + Math.round(6 * u) };
}
export const stripBottom = (W, H) => stripBox(W, H).bottom;

function font(size, weight = 700) { return `${weight} ${size}px ${STRIP_FONT}`; }
function text(ctx, s, x, y, size, { color = '#fff', align = 'left', weight = 700, maxW = Infinity } = {}) {
  ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  let str = String(s); let w = ctx.measureText(str).width;
  if (w > maxW) { let n = str.length; while (n > 1 && ctx.measureText(str.slice(0, n) + '…').width > maxW) n--; str = str.slice(0, n).trimEnd() + '…'; w = ctx.measureText(str).width; }
  ctx.fillStyle = color; ctx.fillText(str, x, y); return w;
}

// Draws the strip; returns the y just under it. `info` null → nothing is drawn and the y is still the same.
export function drawWorkoutStrip(ctx, W, H, info) {
  const b = stripBox(W, H); if (!info) return b.bottom;
  const { x, y, w, h, u } = b; const col = KIND_COLOR[info.kind] || KIND_COLOR.pace;
  panel(ctx, x, y, w, h, { r: 12 * u, fill: 'rgba(10,10,12,.92)', gloss: false });
  ctx.fillStyle = col; ctx.fillRect(x, y + 8 * u, 4 * u, h - 16 * u);
  const px = x + 14 * u; const rx = x + w - 12 * u;
  // row 1: kind · label on the left; on the right (from the edge): W, target, % FTP, intensity chip when it was changed by hand
  const kindName = t(`games.strip.kind.${info.kind}`).toUpperCase();
  const r1 = y + 32 * u; const big = 40 * u;
  let cx = rx;
  cx -= text(ctx, 'W', cx, r1 + 3 * u, 20 * u, { align: 'right', color: '#ecece4', weight: 700 }) + 3 * u;
  cx -= text(ctx, `${info.target}`, cx, r1 + 3 * u, big, { align: 'right', weight: 700, color: '#fff' }) + 9 * u;
  if (info.pct != null) cx -= text(ctx, t('games.strip.pct', { pct: info.pct }), cx, r1 + 2 * u, 18 * u, { align: 'right', color: '#ecece4', weight: 600 }) + 8 * u;
  if (info.bias && Math.abs(info.bias - 1) > 0.004) cx -= text(ctx, t('games.strip.bias', { pct: Math.round(info.bias * 100) }), cx, r1 + 2 * u, 18 * u, { align: 'right', color: LIME, weight: 700 }) + 8 * u;
  const labelMax = cx - px - 6 * u;
  const nameW = text(ctx, kindName, px, r1, 26 * u, { color: col, weight: 700, maxW: Math.max(40 * u, labelMax) });
  if (info.label && labelMax - nameW > 36 * u) text(ctx, info.label, px + nameW + 8 * u, r1, 22 * u, { color: '#f2f0e6', weight: 600, maxW: labelMax - nameW - 8 * u });
  // row 2: time left · elapsed / total · next
  const r2 = y + 59 * u; const sm = 20 * u;
  const leftW = text(ctx, t('games.strip.left', { left: fmt(info.left) }), px, r2, sm, { color: '#fff', weight: 700 });
  let rightW = 0;
  if (info.next) {
    const nt = t('games.strip.next', { watts: info.next.watts, dur: fmt(info.next.dur) });
    ctx.font = font(sm, 700); const nw = Math.min(ctx.measureText(nt).width, w * 0.42); rightW = nw + 8 * u;
    ctx.fillStyle = KIND_COLOR[info.next.kind] || '#fff'; ctx.fillRect(rx - nw - 8 * u, r2 - 14 * u, 3 * u, 16 * u);
    text(ctx, nt, rx, r2, sm, { align: 'right', color: '#fff', weight: 700, maxW: w * 0.42 });
  } else rightW = text(ctx, t('games.strip.last'), rx, r2, sm, { align: 'right', color: '#ecece4', weight: 600 });
  // elapsed / total sits in the middle of the room left between the two; on a narrow phone it steps aside instead of touching them
  if (info.total > 0) {
    const et = `${fmt(info.elapsed)} / ${fmt(info.total)}`; ctx.font = font(sm, 600); const ew = ctx.measureText(et).width;
    const g0 = px + leftW + 10 * u; const g1 = rx - rightW - 10 * u;
    if (g1 - g0 >= ew) text(ctx, et, (g0 + g1) / 2, r2, sm, { align: 'center', color: '#ecece4', weight: 600 });
    else if (g1 - g0 >= ctx.measureText(fmt(info.elapsed)).width) text(ctx, fmt(info.elapsed), (g0 + g1) / 2, r2, sm, { align: 'center', color: '#ecece4', weight: 600 });
  }
  // row 3: the whole workout as a profile: bar heights follow the % FTP, the lime line is where you are
  const by = y + h - 23 * u; const bh = 15 * u; const bx = px; const bw = rx - px;
  const tot = info.total || 1; const mx = Math.max(1.2, ...info.track.map((g) => g.pct));
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by - 1, bw, bh + 2); ctx.clip();
  for (const g of info.track) {
    const gx = bx + (g.t0 / tot) * bw; const gw = Math.max(1, ((g.t1 - g.t0) / tot) * bw - 0.6); const gh = Math.max(2 * u, Math.min(1, g.pct / mx) * bh);
    ctx.globalAlpha = g.t1 <= info.elapsed ? 1 : 0.68; ctx.fillStyle = KIND_COLOR[g.kind] || '#999'; ctx.fillRect(gx, by + bh - gh, gw, gh);
  }
  ctx.restore(); ctx.globalAlpha = 1;
  const px2 = bx + Math.min(1, info.elapsed / tot) * bw; ctx.fillStyle = LIME; ctx.fillRect(Math.round(px2) - 1, by - 3 * u, 2.4 * u, bh + 6 * u);
  return b.bottom;
}
export { INK };
