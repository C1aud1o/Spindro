// Navigazione con i soli tasti del Click (o frecce / Invio / Esc della tastiera): vedi docs/click-navigazione.md.
//  Fermo (nessuna uscita in corso, nessun gioco):  navigazione ATTIVA da sola
//     + / −  → elemento successivo / precedente · tieni + → sceglie · tieni − → indietro
//     su un campo numerico o a elenco: tieni + lo "prende", poi + / − cambiano il valore, tieni + o − per finire
//  Pedalando o giocando: + / − fanno il loro lavoro (marcia, intensità, gioco); tieni − (0,8 s) apre il menu Click.
import { t } from './i18n.js';
const LONG = 650;
const MENU_LONG = 800;
const POLL = 150;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), summary, label.switch, label.file-btn, .modes label';
const SELF_LABEL = 'label.switch, label.file-btn, .modes label'; // l'input dentro queste etichette si attiva dall'etichetta

export function createClickNav({ enabled = () => true, playing = () => false, menuItems, back, prefer, undo, onChange, isIdle = () => true }) {
  const menu = document.createElement('div'); menu.id = 'clickMenu'; menu.className = 'click-menu'; menu.hidden = true;
  menu.innerHTML = `<div class="cm-box"><p class="cm-title">${t('clicknav.title')}</p><div class="cm-list"></div></div>`;
  document.body.appendChild(menu);
  const bar = document.createElement('div'); bar.className = 'click-bar'; bar.hidden = true; bar.setAttribute('role', 'status');
  document.body.appendChild(bar);

  const nav = { active: false, idx: 0, items: [], scope: null, timer: null, fired: false, dir: 0, idleT: null, grab: null, sticky: false, waitRelease: false, menuT: null };

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
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
  function showBar() {
    const on = nav.active || enabled();
    bar.hidden = !on;
    if (!on) return;
    const key = nav.grab ? 'clicknav.barGrab' : nav.active ? 'clicknav.bar' : 'clicknav.barRide';
    if (bar.dataset.k !== key + document.documentElement.lang) { bar.innerHTML = t(key); bar.dataset.k = key + document.documentElement.lang; }
  }
  function poke() { clearTimeout(nav.idleT); nav.idleT = null; }

  function renderMenu() {
    const items = menuItems();
    menu.querySelector('.cm-title').textContent = t('clicknav.title');
    menu.querySelector('.cm-list').innerHTML = items.map((it, i) => `<button type="button" data-i="${i}">${it.label}</button>`).join('');
    menu.querySelectorAll('.cm-list button').forEach((b) => b.addEventListener('click', () => {
      const it = items[+b.dataset.i]; menu.hidden = true; nav.scope = null;
      it.run(); setTimeout(sync, 120);
    }));
  }
  function start() {
    nav.active = true; nav.grab = null; nav.scope = null; nav.waitRelease = !isIdle();
    poke(); refresh(); onChange?.(true);
  }
  function stop() {
    nav.active = false; nav.grab = null; nav.scope = null; menu.hidden = true; clearTimeout(nav.timer); poke();
    document.querySelectorAll('.cn-focus, .cn-grab').forEach((e) => e.classList.remove('cn-focus', 'cn-grab')); showBar(); onChange?.(false);
  }
  function openMenu() {
    nav.sticky = true; renderMenu(); menu.hidden = false;
    if (!nav.active) start(); else { nav.scope = null; refresh(); }
  }
  /** Decide se la navigazione deve essere accesa: chiamata di continuo e a ogni tasto. */
  function sync() {
    const open = overlay();
    if (!enabled() && !open) nav.sticky = false;
    const want = enabled() ? (open || !playing()) : (nav.sticky && open);
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
  function move(d) {
    collect(); if (!nav.items.length) return;
    nav.idx = Math.min(nav.items.length - 1, Math.max(0, nav.idx)); // non dopo la fine se l'elenco si è accorciato
    nav.idx = (nav.idx + d + nav.items.length) % nav.items.length; paint();
  }

  return {
    get active() { return nav.active; },
    sync, overlay, menuOpen, openMenu,
    toggle() { if (menuOpen()) this.closeMenu(); else openMenu(); },
    stop,
    closeMenu() { menu.hidden = true; nav.scope = null; sync(); if (nav.active) refresh(); },
    /** tastiera: Invio = tieni +, Esc = tieni − */
    select() { if (nav.active && !nav.waitRelease) activate(); },
    back() { if (nav.active) goBack(); else openMenu(); },
    // eventi "tasto tenuto" dal Click (dir = +1, −1, 0 = rilasciato). Vero = consumato dalla navigazione.
    hold(d) {
      sync();
      if (!nav.active) {
        // pedalando o giocando: tieni − (0,8 s) apre il menu
        clearTimeout(nav.menuT);
        if (d < 0 && enabled()) nav.menuT = setTimeout(() => { if (nav.active) return; undo?.(); openMenu(); }, MENU_LONG);
        return false;
      }
      poke();
      if (nav.waitRelease) { if (!d && isIdle()) nav.waitRelease = false; return true; }
      if (d) {
        nav.dir = d; nav.fired = false; clearTimeout(nav.timer);
        nav.timer = setTimeout(() => {
          nav.fired = true;
          if (nav.grab) { nav.grab = null; paint(); showBar(); } else if (d > 0) activate(); else goBack();
        }, LONG);
      } else if (nav.dir) {
        clearTimeout(nav.timer);
        if (!nav.fired) {
          if (nav.grab) { adjust(nav.grab, nav.dir); } else move(nav.dir > 0 ? 1 : -1);
        }
        nav.dir = 0;
      }
      return true;
    },
  };
}
