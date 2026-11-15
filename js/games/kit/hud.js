// HUD dei giochi 3D: numeri grandi e contrastati, leggibili in bici a 1 m dal telefono.
// Regole (docs/giochi-stile.md): numeri chiave ≥ 44 px, etichette ≥ 13 px, contorno scuro, pannelli semitrasparenti.
// Caratteri (OFL, in assets/fonts): "Lilita One" per titoli e numeri, "Nunito" per istruzioni e frasi. Niente monospace.
// Sistema anti-sovrapposizione: testo che si riduce nello spazio libero (txt), a capo automatico (paragraph),
// margini di sicurezza (hudView/safeBox) e coda di messaggi a centro schermo (MessageQueue). Guida: docs/giochi-stile.md §6b.
export const FONT_DISPLAY = '"Spindro Display", "Lilita One", "Barlow Condensed", "Arial Rounded MT Bold", "Arial Narrow", sans-serif';
export const FONT_TEXT = '"Spindro Text", Nunito, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const HUD_FONT = FONT_DISPLAY; // compatibilità: titoli e numeri
export const HUD = { lime: '#d9ff3d', cyan: '#4de3ff', red: '#ff5a6a', gold: '#ffd34d', white: '#ffffff', dim: '#d8d8d8', ink: 'rgba(12,12,18,.62)' };

// I caratteri sono nel CSS (@font-face "Spindro Display/Text"): sul canvas vanno caricati prima di disegnare.
let fontsReady = false;
export function loadHudFonts() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all(['400 32px "Spindro Display"', '700 16px "Spindro Text"', '900 16px "Spindro Text"'].map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => { fontsReady = true; });
}
loadHudFonts();

// zona sicura: viewport dell'HUD per ogni contesto (margine ai lati; in alto/basso le barre di sistema dei telefoni)
const views = new WeakMap();
export function hudView(ctx, W, H, margin = 10) { views.set(ctx, { W, H, m: margin }); return views.get(ctx); }
export function safeBox(ctx, W = 0, H = 0) { const v = views.get(ctx) || { W, H, m: 10 }; return { x: v.m, y: v.m, w: v.W - 2 * v.m, h: v.H - 2 * v.m, W: v.W, H: v.H }; }

function fontOf(kind, size, weight, italic) {
  if (kind === 'text') return `${italic ? 'italic ' : ''}${weight >= 800 ? 900 : 700} ${size}px ${FONT_TEXT}`;
  return `${italic ? 'italic ' : ''}400 ${size}px ${FONT_DISPLAY}`; // Lilita One esiste solo in 400: niente grassetto finto
}

// spazio orizzontale libero attorno a x, rispettando i margini di sicurezza
function room(ctx, x, align) {
  const v = views.get(ctx); if (!v) return Infinity;
  if (align === 'center') return 2 * Math.max(8, Math.min(x - v.m, v.W - v.m - x));
  if (align === 'right' || align === 'end') return Math.max(8, x - v.m);
  return Math.max(8, v.W - v.m - x);
}

// misura con il font indicato
export function measure(ctx, text, size, { font = 'display', weight = 800, italic = false } = {}) {
  ctx.font = fontOf(font, size, weight, italic); return ctx.measureText(text).width;
}

// riduce la dimensione finché il testo sta in maxW (minimo `minK` × size); se non basta, abbrevia con "…"
export function fitText(ctx, text, size, maxW, { font = 'display', weight = 800, italic = false, minK = 0.6 } = {}) {
  let s = size; ctx.font = fontOf(font, s, weight, italic);
  let w = ctx.measureText(text).width;
  if (w > maxW) { s = Math.max(size * minK, Math.floor(size * maxW / w * 10) / 10); ctx.font = fontOf(font, s, weight, italic); w = ctx.measureText(text).width; }
  if (w > maxW) { let tt = text; while (tt.length > 1 && ctx.measureText(tt + '…').width > maxW) tt = tt.slice(0, -1); text = tt.trimEnd() + '…'; w = ctx.measureText(text).width; }
  return { text, size: s, width: w };
}

// testo con contorno; size in px CSS; restituisce la larghezza.
// maxW: larghezza massima (se manca, è lo spazio libero fino al margine dello schermo); il testo si riduce da solo.
// font: 'display' (titoli, numeri) o 'text' (istruzioni, frasi).
export function txt(ctx, text, x, y, { size = 16, color = '#fff', align = 'left', weight = 800, stroke = 'rgba(0,0,0,.85)', base = 'alphabetic', italic = false, font = 'display', maxW = null, minK = 0.6 } = {}) {
  text = String(text);
  const lim = maxW != null ? Math.min(maxW, room(ctx, x, align)) : room(ctx, x, align);
  const f = Number.isFinite(lim) ? fitText(ctx, text, size, lim, { font, weight, italic, minK }) : null;
  if (f) { text = f.text; size = f.size; }
  ctx.font = fontOf(font, size, weight, italic);
  ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

// divide un paragrafo in righe che stanno in maxW (a capo alle parole; parole troppo lunghe spezzate)
export function wrapLines(ctx, text, maxW, size, { font = 'text', weight = 700, italic = false, maxLines = Infinity } = {}) {
  ctx.font = fontOf(font, size, weight, italic);
  const out = []; let cur = '';
  const push = () => { if (cur) out.push(cur); cur = ''; };
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (ctx.measureText(w).width > maxW && w.length > 1) { // parola più larga della riga: spezza
      let n = w.length - 1; while (n > 1 && ctx.measureText(w.slice(0, n) + '-').width > maxW) n--;
      push(); out.push(w.slice(0, n) + '-'); w = w.slice(n);
    }
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width <= maxW) cur = next; else { push(); cur = w; }
  }
  push();
  if (out.length > maxLines) { const k = out.slice(0, maxLines); let last = k[maxLines - 1]; while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1); k[maxLines - 1] = last.trimEnd() + '…'; return k; }
  return out;
}

// paragrafo a capo automatico; se è troppo alto per maxH, riduce il corpo (fino a minK). Restituisce { bottom, lines, size }.
export function paragraph(ctx, text, x, y, { size = 16, maxW = null, maxH = Infinity, lineK = 1.3, align = 'center', color = '#e8e8e8', font = 'text', weight = 700, stroke = 'rgba(0,0,0,.85)', maxLines = Infinity, minK = 0.7 } = {}) {
  const lim = maxW != null ? Math.min(maxW, room(ctx, x, align)) : room(ctx, x, align);
  const W = Number.isFinite(lim) ? lim : 320;
  let s = size; let lines = wrapLines(ctx, text, W, s, { font, weight, maxLines });
  while (lines.length * s * lineK > maxH && s > size * minK) { s -= 0.5; lines = wrapLines(ctx, text, W, s, { font, weight, maxLines }); }
  const lh = s * lineK;
  lines.forEach((l, i) => txt(ctx, l, x, y + i * lh, { size: s, color, align, font, weight, stroke, maxW: W, minK: 1 }));
  return { bottom: y + lines.length * lh, lines: lines.length, size: s };
}

// ---------- coda dei messaggi a centro schermo ----------
// Un messaggio alla volta. Chi ha priorità più alta passa avanti (e, se è molto più urgente, interrompe quello in corso);
// stessi `key` non si ripetono in coda. Una piccola pausa tra un messaggio e l'altro.
// Uso: const q = new MessageQueue(); q.say('VIA!', { color, prio: 3, dur: 1, big: true }); q.update(dt); q.draw(ctx, W, H, { u, y })
export class MessageQueue {
  constructor({ max = 4, gap = 0.12 } = {}) { this.items = []; this.cur = null; this.max = max; this.gap = gap; this.wait = 0; }
  get busyBig() { return !!(this.cur && this.cur.big); }
  clear() { this.items = []; this.cur = null; this.wait = 0; }
  say(text, { color = HUD.gold, prio = 1, dur = 1.6, big = false, sub = null, key = null, maxWait = 3 } = {}) {
    key = key || text;
    if (this.cur && this.cur.key === key) { this.cur.t = Math.max(this.cur.t, dur); return; }
    const old = this.items.find((x) => x.key === key);
    if (old) { old.prio = Math.max(old.prio, prio); return; }
    this.items.push({ text, color, prio, dur, big, sub, key, wait: maxWait, t: dur, t0: dur, seq: (this._n = (this._n || 0) + 1) });
    this.items.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    // coda piena: scarta il meno importante
    while (this.items.length > this.max) this.items.pop();
    // molto più urgente di quello che si vede: lo interrompe
    if (this.cur && this.items[0].prio >= this.cur.prio + 2) { this.cur.t = Math.min(this.cur.t, 0.15); }
  }
  update(dt) {
    if (this.cur) { this.cur.t -= dt; if (this.cur.t <= 0) { this.cur = null; this.wait = this.gap; } }
    // un messaggio che aspetta troppo non serve più: sparisce
    for (const it of this.items) it.wait -= dt;
    this.items = this.items.filter((it) => it.wait > 0);
    if (!this.cur) { this.wait -= dt; if (this.wait <= 0 && this.items.length) { this.cur = this.items.shift(); } }
    // in coda da troppo: i messaggi poco importanti si accorciano così non arrivano in ritardo
    if (this.items.length > 1 && this.cur) this.cur.t = Math.min(this.cur.t, this.cur.t0 * 0.8 + 0.001);
  }
  // disegna al centro (y = baseline del messaggio, di default 30% dell'altezza); usa u per la scala
  draw(ctx, W, H, { u = 1, y = H * 0.3, maxW = null } = {}) {
    const m = this.cur; if (!m) return 0;
    const age = m.t0 - m.t;
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.t * 4, 0.3 + age * 6);
    const pop = m.big ? 1 + Math.max(0, (0.25 - age) / 0.25) * 0.35 : 1;
    const size = (m.big ? 36 : 20) * u * pop;
    const lim = maxW || (W - 28);
    txt(ctx, m.text, W / 2, y, { size, color: m.color, align: 'center', italic: m.big, maxW: lim, minK: 0.5 });
    let bottom = y + 8;
    if (m.sub) { txt(ctx, m.sub, W / 2, y + 22 * u, { size: 15 * u, align: 'center', color: HUD.dim, font: 'text', maxW: lim }); bottom = y + 28 * u; }
    ctx.restore();
    return bottom;
  }
}

export function panel(ctx, x, y, w, h, { r = 10, fill = HUD.ink, border = null } = {}) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fill();
  if (border) { ctx.lineWidth = 2; ctx.strokeStyle = border; ctx.stroke(); }
}

// scala dell'interfaccia: 1 su un telefono in verticale, fino a 1.45 su schermi grandi
export function uiScale(W, H) { return Math.max(1, Math.min(1.45, Math.min(W, H) / 390)); }

// colore della potenza rispetto alla soglia sprint (zona facile → bianco, vicino → giallo, sopra → ciano)
export function powerColor(power, threshold) {
  if (!threshold) return HUD.white;
  if (power >= threshold) return HUD.cyan;
  if (power >= threshold * 0.8) return HUD.gold;
  return HUD.white;
}

// colore della pendenza: discesa ciano, piano bianco, salita da giallo a rosso
export function gradeColor(g) {
  if (g <= -1) return HUD.cyan;
  if (g < 1.5) return HUD.white;
  if (g < 4) return HUD.gold;
  return HUD.red;
}
