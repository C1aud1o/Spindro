// Navigazione con i tasti dei controller Zwift, per RUOLI (plus, minus, up, down, left, right, ok, back): vedi docs/click-navigazione.md.
// Un solo modello su tutte le schermate:
//   due tasti (Click v1):  + / − spostano · tieni + sceglie · tieni − torna indietro
//   con le frecce:         le frecce spostano nello spazio (elemento più vicino in quella direzione, con giro ai bordi)
//                          ok (A) sceglie subito · back (B) torna subito · + / − cambiano il valore di cursori / numeri / elenchi, altrimenti spostano
//   pedalando:             + / − cambiano marcia o ERG · ok o tieni − apre il menu Click · back lo chiude
//   in un gioco:           + / − (e sinistra / destra) vanno al gioco · tieni back 0,8 s (o tieni − con due tasti) apre il menu Click
// In basso una legenda dice sempre cosa fanno i tasti ADESSO; sul tasto lungo l'elemento in primo piano si riempie.
import { t } from './i18n.js';
import { icon } from './icons.js';
const LONG = 650;
const MENU_LONG = 800;
const POLL = 150;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), summary, label.switch, label.file-btn, .modes label';
const SELF_LABEL = 'label.switch, label.file-btn, .modes label'; // l'input dentro queste etichette si attiva dall'etichetta
const TWO_KEY = { plus: true, minus: true, plusMinus: true, up: false, down: false, left: false, right: false, ok: false, back: false, menu: false, arrows: false };

/** Elemento più vicino a `cur` nella direzione `dir` ('up' | 'down' | 'left' | 'right'); null se non c'è. Pura: lavora sui rettangoli. */
export function pickSpatial(rects, cur, dir, wrap = true) {
  const R = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.right - r.left, h: r.bottom - r.top }); // (DOMRect: le proprietà non si copiano con lo spread)
  const c = R(cur); const horiz = dir === 'left' || dir === 'right';
  const gap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1)); // distanza fra due intervalli (0 = si sovrappongono)
  const info = (r) => {
    const o = R(r);
    return horiz
      ? { along: o.cx - c.cx, across: gap(c.top, c.bottom, o.top, o.bottom), cross: Math.abs(o.cy - c.cy), size: Math.min(o.w, c.w), o }
      : { along: o.cy - c.cy, across: gap(c.left, c.right, o.left, o.right), cross: Math.abs(o.cx - c.cx), size: Math.min(o.h, c.h), o };
  };
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = null; let bestScore = Infinity;
  rects.forEach((r, i) => {
    const k = info(r);
    if (k.o.left === c.left && k.o.top === c.top && k.o.right === c.right && k.o.bottom === c.bottom) return; // lo stesso elemento
    const d = k.along * sign;
    if (d <= Math.max(2, k.size * 0.35)) return; // non è davvero oltre (stessa riga / colonna)
    const score = d + 3 * k.across + 0.25 * k.cross;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best != null || !wrap) return best;
  // niente oltre: si riparte dal bordo opposto, nella stessa riga / colonna se possibile
  rects.forEach((r, i) => {
    const k = info(r);
    if (k.o.left === c.left && k.o.top === c.top && k.o.right === c.right && k.o.bottom === c.bottom) return;
    const edge = horiz ? k.o.cx : k.o.cy;
    const score = (sign > 0 ? edge : -edge) + 3 * k.across + 0.25 * k.cross;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

export function createClickNav({ enabled = () => true, playing = () => false, inGame = () => false, caps = () => TWO_KEY, blocked = () => false, remote = () => false, menuItems, back, prefer, undo, onChange }) {
  const menu = document.createElement('div'); menu.id = 'clickMenu'; menu.className = 'click-menu'; menu.hidden = true;
  menu.innerHTML = `<div class="cm-box"><p class="cm-title">${t('clicknav.title')}</p><div class="cm-list"></div></div>`;
  document.body.appendChild(menu);
  const bar = document.createElement('div'); bar.className = 'click-bar'; bar.hidden = true; bar.setAttribute('role', 'status');
  document.body.appendChild(bar);
  const fill = document.createElement('div'); fill.className = 'cn-fill'; fill.hidden = true; fill.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fill);

  const nav = { active: false, idx: 0, items: [], scope: null, grab: null, sticky: false, menuT: null, ignore: new Set() };
  const held = new Set(); // ruoli premuti adesso
  const pend = new Map(); // ruolo → { timer, fired, long } (tasti che agiscono al rilascio o dopo una pressione lunga)

  const visible = (el) => !!(el.offsetParent || el.getClientRects().length) && !el.closest('[hidden]');
  const shown = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
  const menuOpen = () => !menu.hidden;
  /** C'è qualcosa aperto sopra la home (pannello, finestra, menu giochi…)? */
  function overlay() {
    if (menuOpen() || document.querySelector('.calib') || [...document.querySelectorAll('.sheet')].some((s) => !s.hidden) || shown('debugPanel')) return true;
    if (shown('gamePanel')) return !!(document.getElementById('gameMenu') && !document.getElementById('gameMenu').hidden) || !!document.querySelector('.video-pick:not([hidden])');
    return false;
  }
  function scope() {
    if (menuOpen()) return menu;
    const dlg = [...document.querySelectorAll('.calib')]; if (dlg.length) return dlg[dlg.length - 1];
    const sheets = [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden);
    if (sheets.length) return sheets[sheets.length - 1];
    if (shown('debugPanel')) return document.getElementById('debugPanel');
    if (shown('gamePanel')) return document.getElementById('gamePanel');
    return document.body;
  }
  function collect() {
    const sc = nav.scope = scope();
    nav.items = [...sc.querySelectorAll(FOCUSABLE)].filter((el) => visible(el) && !el.closest('.click-bar') && (sc === menu || !el.closest('#clickMenu')))
      .filter((el) => !(el.tagName === 'INPUT' && el.closest(SELF_LABEL)));
  }
  function initialIndex() {
    const want = nav.scope === document.body ? prefer?.(nav.scope) : nav.scope.querySelector('[data-primary], .game-card');
    let i = want ? nav.items.indexOf(want) : -1;
    if (i < 0) i = nav.items.findIndex((el) => !el.classList.contains('close') && !el.matches('#closeGame, #muteGame'));
    return Math.max(0, i);
  }
  function paint() {
    document.querySelectorAll('.cn-focus, .cn-grab').forEach((e) => e.classList.remove('cn-focus', 'cn-grab'));
    const el = nav.items[nav.idx]; if (!el) return;
    el.classList.add('cn-focus'); if (nav.grab === el) el.classList.add('cn-grab');
    // "nearest" + scroll-margin (css): mai sotto la barra in basso né sotto la legenda
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  /** Rifà l'elenco; se la schermata è cambiata riparte dall'elemento più utile. */
  function refresh(keep = false) {
    const cur = nav.items[nav.idx]; const prev = nav.scope;
    collect();
    if (nav.scope !== prev) { nav.grab = null; nav.idx = initialIndex(); }
    else if (keep && cur && nav.items.includes(cur)) nav.idx = nav.items.indexOf(cur);
    else if (nav.idx >= nav.items.length) nav.idx = 0;
    paint(); showBar();
  }

  // ---- legenda ----
  const kk = (...keys) => (keys.length > 1 && keys.every((k) => k.length === 1) ? `<kbd class="kk">${keys.join(' ')}</kbd>` : keys.map((k) => `<kbd class="kk">${k}</kbd>`).join('')); // varie icone di fila = un solo riquadro
  const hold = (k) => `${t('legend.hold')} ${kk(k)}`;
  function legendContext() {
    if (nav.active) return nav.grab ? 'grab' : 'menu';
    if (remote()) return 'remote';
    return inGame() ? 'game' : 'ride';
  }
  /** Testo della legenda (HTML con piccole icone dei tasti) per un contesto e per ciò che il controller sa fare. Pura rispetto al DOM. */
  function legendHtml(ctx, c, focusIsValue) {
    const arrows = !!c.arrows; const pm = !!c.plusMinus;
    const sel = c.ok ? kk('A') : pm ? hold('+') : hold('▶');
    const bk = c.back ? kk('B') : pm ? hold('−') : hold('◀');
    const menuKey = c.ok && ctx === 'ride' ? kk('A') : c.menu && !pm ? kk('☰') : hold('−');
    const shiftKeys = pm ? kk('+', '−') : kk('▲', '▼');
    const parts = [];
    if (ctx === 'grab') {
      parts.push(`${kk('+', '−')} ${t('legend.change')}`);
      parts.push(`${c.ok ? kk('A') : `${hold('+')} ${t('legend.or')} ${kk('−')}`} ${t('legend.done')}`);
    } else if (ctx === 'menu') {
      parts.push(`${arrows ? kk('▲', '▼', '◀', '▶') : kk('+', '−')} ${t('legend.move')}`);
      if (arrows && pm && focusIsValue) parts.push(`${kk('+', '−')} ${t('legend.change')}`);
      parts.push(`${sel} ${t('legend.choose')}`);
      parts.push(`${bk} ${t('legend.back')}`);
    } else if (ctx === 'remote') {
      parts.push(`<b class="rm-chip">${t('legend.remote')}</b>`);
      if (arrows) {
        parts.push(`${kk('▲', '▼')} ${t('legend.volume')}`, `${kk('◀', '▶')} ${t('legend.seek')}`);
        if (c.ok) parts.push(`${kk('A')} ${t('legend.playpause')}`);
        if (c.back) parts.push(`${kk('B')} ${t('legend.browserBack')}`);
        parts.push(`${c.menu ? kk('☰') : hold('−')} ${t('legend.menu')}`);
      } else {
        parts.push(`${kk('+', '−')} ${t('legend.seek')}`, `${hold('−')} ${t('legend.menu')}`);
      }
    } else if (ctx === 'game') {
      parts.push(`${pm ? kk('+', '−') : kk('▲', '▼')}${arrows && c.left ? kk('◀', '▶') : ''} ${t('legend.game')}`);
      parts.push(`${arrows && c.back ? hold('B') : c.menu && !pm ? kk('☰') : hold('−')} ${t('legend.menu')}`);
    } else {
      parts.push(`${shiftKeys} ${t('legend.shift')}`);
      parts.push(`${menuKey} ${t('legend.menu')}`);
    }
    return parts.join(' <i>·</i> ');
  }
  function showBar() {
    const on = !blocked() && (nav.active || enabled());
    bar.hidden = !on; document.body.classList.toggle('click-legend', on);
    if (!on) { document.documentElement.style.removeProperty('--legend-h'); return; }
    const el = nav.items[nav.idx];
    const html = legendHtml(legendContext(), caps(), !!el && isGrabbable(el));
    if (bar.dataset.k !== html + document.documentElement.lang) { bar.innerHTML = html; bar.dataset.k = html + document.documentElement.lang; }
    // altezza della legenda (può andare su due righe, soprattutto in tedesco): i contenitori che scorrono lasciano questo spazio in fondo (css: --legend-h)
    const h = `${Math.ceil(bar.offsetHeight) + 10}px`;
    if (document.documentElement.style.getPropertyValue('--legend-h') !== h) document.documentElement.style.setProperty('--legend-h', h);
  }

  // ---- ciclo di vita ----
  function renderMenu() {
    const items = menuItems();
    menu.querySelector('.cm-title').textContent = t('clicknav.title');
    menu.querySelector('.cm-list').innerHTML = items.map((it, i) => (it.heading ? `<p class="cm-head">${it.label}</p>` : `<button type="button" data-i="${i}">${icon(it.icon, 'ico-line cm-ico')}<span>${it.label}</span></button>`)).join('');
    menu.querySelectorAll('.cm-list button').forEach((b) => b.addEventListener('click', () => {
      const it = items[+b.dataset.i]; menu.hidden = true; nav.scope = null;
      it.run(); setTimeout(sync, 120);
    }));
  }
  function start() {
    nav.active = true; nav.grab = null; nav.scope = null;
    nav.ignore = new Set(held); // tasti già premuti all'accensione (es. il "tieni −" che ha aperto il menu): si ignorano fino al rilascio
    clearPend(); clearTimeout(nav.menuT);
    refresh(); onChange?.(true);
  }
  function stop() {
    nav.active = false; nav.grab = null; nav.scope = null; menu.hidden = true; clearPend(); clearTimeout(nav.menuT);
    document.querySelectorAll('.cn-focus, .cn-grab').forEach((e) => e.classList.remove('cn-focus', 'cn-grab')); showBar(); onChange?.(false);
  }
  function openMenu() {
    nav.sticky = true; renderMenu(); menu.hidden = false;
    if (!nav.active) start(); else { nav.scope = null; refresh(); }
  }
  /** Decide se la navigazione deve essere accesa: chiamata di continuo e a ogni tasto. */
  function sync() {
    if (blocked()) { if (nav.active) stop(); bar.hidden = true; document.body.classList.remove('click-legend'); document.documentElement.style.removeProperty('--legend-h'); return; }
    const open = overlay();
    if (!enabled() && !open) nav.sticky = false;
    const want = enabled() ? (open || (!playing() && !remote())) : (nav.sticky && open); // in modalità Remote il Click non naviga in Spindro finché non si apre il menu
    if (want && !nav.active) start();
    else if (!want && nav.active) stop();
    else if (nav.active) { if (scope() !== nav.scope) refresh(); else showBar(); }
    else showBar();
  }
  setInterval(sync, POLL);

  // ---- azioni ----
  function adjust(el, d) {
    if (el.tagName === 'SELECT') {
      const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + d));
      if (i === el.selectedIndex) return; el.selectedIndex = i;
    } else {
      const step = parseFloat(el.step) || 1; const min = el.min === '' ? -Infinity : +el.min; const max = el.max === '' ? Infinity : +el.max;
      const dec = (String(step).split('.')[1] || '').length;
      const cur = Number.isFinite(parseFloat(el.value)) ? parseFloat(el.value) : (Number.isFinite(min) ? min : 0);
      el.value = Math.min(max, Math.max(min, +(cur + d * step).toFixed(dec)));
    }
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const isGrabbable = (el) => el.tagName === 'SELECT' || (el.tagName === 'INPUT' && /number|range/.test(el.type));
  function activate() {
    const el = nav.items[nav.idx]; if (!el) return;
    if (isGrabbable(el)) { nav.grab = el; paint(); showBar(); return; }
    if (el.tagName === 'INPUT' && /text|url|number|password|email|search/.test(el.type)) { el.focus(); return; }
    el.click();
    setTimeout(() => { if (nav.active) refresh(true); }, 150);
  }
  function goBack() {
    if (nav.grab) { nav.grab = null; paint(); showBar(); return; }
    if (overlay()) back?.();
    setTimeout(() => nav.active && refresh(), 150);
  }
  function move(d) { // lineare: elemento successivo / precedente in ordine di lettura
    collect(); if (!nav.items.length) return;
    nav.idx = Math.min(nav.items.length - 1, Math.max(0, nav.idx)); // non dopo la fine se l'elenco si è accorciato
    nav.idx = (nav.idx + d + nav.items.length) % nav.items.length; paint();
  }
  function moveDir(dir) { // spaziale, per i controller con le frecce
    collect(); if (!nav.items.length) return;
    nav.idx = Math.min(nav.items.length - 1, Math.max(0, nav.idx));
    const rects = nav.items.map((e) => e.getBoundingClientRect());
    const i = pickSpatial(rects, rects[nav.idx], dir, true);
    if (i != null) { nav.idx = i; paint(); }
  }

  // ---- tasti ----
  const clearPend = () => { for (const p of pend.values()) clearTimeout(p.timer); pend.clear(); fill.hidden = true; fill.className = 'cn-fill'; };
  function showFill(kind, ms) {
    const el = nav.active ? nav.items[nav.idx] : null;
    if (!el) { bar.classList.remove('holding'); void bar.offsetWidth; bar.style.setProperty('--hold-ms', `${ms}ms`); bar.classList.add('holding'); return; }
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    Object.assign(fill.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius, '--hold-ms': `${ms}ms` });
    fill.className = `cn-fill ${kind}`; fill.hidden = false; void fill.offsetWidth; fill.classList.add('go');
  }
  const hideFill = () => { fill.hidden = true; fill.className = 'cn-fill'; bar.classList.remove('holding'); };

  const playLike = (c) => !c.plusMinus && !c.ok; // solo frecce (Play): destra / sinistra tenuti fanno da "scegli" e "indietro"
  const LONG_ACTION = (role, c) => (role === 'plus' ? 'select' : role === 'minus' ? 'back' : playLike(c) && role === 'right' ? 'select' : playLike(c) && role === 'left' ? 'back' : null);
  const DIRS = { up: 'up', down: 'down', left: 'left', right: 'right' };

  function shortAction(role, c) {
    const el = nav.items[nav.idx];
    const sign = role === 'plus' || role === 'right' || role === 'down' ? 1 : -1;
    if (nav.grab) { adjust(nav.grab, role === 'up' ? 1 : role === 'down' ? -1 : sign); return; }
    if (c.arrows && c.plusMinus && el && isGrabbable(el) && (role === 'plus' || role === 'minus')) { adjust(el, sign); return; } // con le frecce + / − cambiano il valore sul posto
    if (role === 'plus' || role === 'minus') move(sign);
    else if (c.arrows) moveDir(DIRS[role]);
    else move(role === 'up' || role === 'left' ? -1 : 1); // tastiera con un controller a due tasti: frecce = avanti / indietro
  }

  /** Un tasto (per ruolo) è stato premuto (down = true) o rilasciato. Chiamato dagli eventi 'press' / 'release' del driver e dalla tastiera. */
  function key(role, down) {
    if (!role || blocked()) return;
    sync(); // prima di registrare il tasto: se è questo a trovare la navigazione spenta, deve poterla usare subito
    if (down) held.add(role); else held.delete(role);
    const c = caps();
    if (!nav.active) { inactiveKey(role, down, c); return; }
    if (nav.ignore.has(role)) { if (!down) nav.ignore.delete(role); return; }
    const longAct = LONG_ACTION(role, c);
    if (down) {
      if (pend.has(role)) return; // ripetizione (tastiera)
      if (role === 'ok') { if (nav.grab) { nav.grab = null; paint(); showBar(); } else activate(); return; }
      if (role === 'back') { goBack(); return; }
      if (role === 'menu') return; // il tasto menu arriva come 'combo'
      const p = { fired: false, timer: null };
      if (longAct) {
        p.timer = setTimeout(() => {
          p.fired = true; hideFill();
          if (nav.grab) { nav.grab = null; paint(); showBar(); } else if (longAct === 'select') activate(); else goBack();
        }, LONG);
        showFill(longAct, LONG);
        pend.set(role, p);
      } else if (DIRS[role]) shortAction(role, c); // frecce: subito
    } else {
      const p = pend.get(role); if (!p) return;
      clearTimeout(p.timer); pend.delete(role); hideFill();
      if (!p.fired) shortAction(role, c);
    }
  }
  function inactiveKey(role, down, c) {
    if (!enabled()) return;
    const game = inGame();
    // pedalando: ok apre il menu; tieni − (o, in un gioco con le frecce, tieni back) lo apre dopo 0,8 s
    if (down && role === 'ok' && !game && playing()) { clearTimeout(nav.menuT); openMenu(); return; }
    const opener = game && c.arrows && c.back ? 'back' : 'minus';
    if (role !== opener) return;
    clearTimeout(nav.menuT);
    if (!down) { hideFill(); return; }
    showFill('back', MENU_LONG);
    nav.menuT = setTimeout(() => { hideFill(); if (nav.active) return; if (role === 'minus') undo?.(); openMenu(); }, MENU_LONG);
  }
  /** Tutti i tasti rilasciati (controller scollegato). */
  function releaseAll() { held.clear(); nav.ignore.clear(); clearPend(); clearTimeout(nav.menuT); }

  return {
    get active() { return nav.active; },
    sync, overlay, menuOpen, openMenu, key, releaseAll, legendHtml,
    toggle() { if (menuOpen()) this.closeMenu(); else openMenu(); },
    stop,
    closeMenu() { menu.hidden = true; nav.scope = null; sync(); if (nav.active) refresh(); },
    back() { if (nav.active) goBack(); else openMenu(); },
  };
}
