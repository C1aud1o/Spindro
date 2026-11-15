// "Controlla il tuo controller" (Verifica tasti): foglio a schermo intero che
//  1. mostra in diretta quale tasto l'app riceve (si accende sul disegno, nome in grande, id grezzo in piccolo; "?" se sconosciuto);
//  2. guida a imparare i tasti: "Premi +", "Premi −", poi (modelli con più tasti) Su, Giù, Sinistra, Destra, A, B, Y, Z;
//     l'id grezzo ricevuto diventa il RUOLO di quel tasto (js/click.js → localStorage "clickRoles", per famiglia di dispositivo);
//  3. copia un rapporto breve (modello, byte dei messaggi visti, tabella ruolo → id, id sconosciuti, build) senza dati personali.
// Si apre da sola al primo collegamento di ogni modello, dal pannello Dispositivi e dal menu Click.
// Finché è aperta i tasti NON navigano né cambiano marcia (app.js: blocked).
import { ROLES, KIND_NAMES } from './click.js';
import { BUILD, CHANNEL } from './build.js';

// Passi della procedura guidata per famiglia. 'y' e 'z' sono facoltativi e diventano il ruolo "menu" (aprono il menu Click).
const STEPS = {
  v1: ['plus', 'minus'],
  v2: ['plus', 'minus', 'up', 'down', 'left', 'right', 'ok', 'back', 'y', 'z'],
  ride: ['plus', 'minus', 'up', 'down', 'left', 'right', 'ok', 'back', 'y', 'z'],
  play: ['up', 'down', 'left', 'right', 'menu'],
};
const OPTIONAL = new Set(['y', 'z', 'menu']);
// nome del tasto "fisico" per gli id che non hanno un ruolo (Y e Z): servono a far accendere il tasto giusto sul disegno
const NAME_SLOT = { 'ride:6': 'y', 'ride:7': 'z', 'zr:6': 'y', 'zr:7': 'z' };
const GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶', ok: 'A', back: 'B', y: 'Y', z: 'Z', plus: '+', minus: '−', menu: '☰' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Disegno semplice del modello (senza loghi). Ogni tasto è <g data-slot="…">; lo stesso slot può comparire due volte (Play). */
export function drawing(kind) {
  const key = (slot, x, y, label, r = 17) => `<g class="cc-key" data-slot="${slot}"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y + 6}">${label}</text></g>`;
  const pill = (slot, x, y, label) => `<g class="cc-key" data-slot="${slot}"><rect x="${x - 26}" y="${y - 15}" width="52" height="30" rx="15"/><text x="${x}" y="${y + 7}">${label}</text></g>`;
  const unk = (x, y) => `<g class="cc-key cc-unk" data-slot="?"><circle cx="${x}" cy="${y}" r="15"/><text x="${x}" y="${y + 6}">?</text></g>`;
  let body;
  if (kind === 'v1') {
    body = `<circle class="cc-body" cx="170" cy="95" r="84"/>${key('plus', 170, 52, '+', 28)}${key('minus', 170, 138, '−', 28)}${unk(282, 95)}`;
  } else if (kind === 'play') {
    body = `<rect class="cc-body" x="8" y="10" width="146" height="150" rx="40"/><rect class="cc-body" x="186" y="10" width="146" height="150" rx="40"/>
      ${key('up', 81, 42, '▲')}${key('down', 81, 126, '▼')}${key('left', 39, 84, '◀')}${key('right', 123, 84, '▶')}
      ${key('up', 259, 42, 'Y')}${key('down', 259, 126, 'B')}${key('left', 217, 84, 'Z')}${key('right', 301, 84, 'A')}
      ${key('menu', 170, 30, '☰')}${unk(170, 130)}`;
  } else { // v2 e Ride: due moduli, frecce e "−" a sinistra, A/B/Y/Z e "+" a destra
    body = `<rect class="cc-body" x="8" y="6" width="146" height="178" rx="44"/><rect class="cc-body" x="186" y="6" width="146" height="178" rx="44"/>
      ${key('up', 81, 36, '▲')}${key('down', 81, 100, '▼')}${key('left', 49, 68, '◀')}${key('right', 113, 68, '▶')}${pill('minus', 81, 152, '−')}
      ${key('y', 259, 36, 'Y')}${key('back', 259, 100, 'B')}${key('z', 227, 68, 'Z')}${key('ok', 291, 68, 'A')}${pill('plus', 259, 152, '+')}
      ${key('menu', 170, 40, '☰', 15)}${unk(170, 130)}`;
  }
  return `<svg class="cc-svg" viewBox="0 0 340 190" role="img" aria-hidden="true">${body}</svg>`;
}

/** Slot del disegno che si accende per un tasto: il ruolo se c'è, altrimenti il nome noto (Y, Z), altrimenti "?". */
export function slotFor(id, role) {
  if (role === 'menu') return NAME_SLOT[id] || 'menu';
  if (role) return role;
  return NAME_SLOT[id] || '?';
}

export function createClickCheck({ click, t, playing = () => false }) {
  let el = null; let open = false;
  const st = { mode: 'live', step: 0, last: null, got: null, warn: '', msg: '', run: {}, lit: new Set(), timer: null };

  const kind = () => click.kind || (click.links[0]?.model === 'play' ? 'play' : click.links[0]?.model === 'ride' ? 'ride' : null);
  const drawKind = () => kind() || 'v2';
  const steps = () => STEPS[kind() || 'v1'];
  const roleName = (r) => t(`clickcheck.role.${r}`);

  function reportText() {
    const d = click.reportData();
    const lines = [
      'Spindro controller report',
      `App build: ${BUILD} (${CHANNEL})`,
      `Controller: ${d.kinds.length ? d.kinds.map((k) => KIND_NAMES[k]).join(' + ') : click.connected ? 'Zwift Click (type not seen yet)' : 'none connected'}`,
      `Protocol messages seen: ${d.types.join(', ') || 'none'}`,
      `Mapping: ${d.confirmed ? 'confirmed by the user' : 'defaults, not confirmed by the user'}`,
      'Roles (role = raw id):',
      ...ROLES.filter((r) => d.rows[r]).map((r) => `  ${r} = ${d.rows[r].map((id) => (id === d.learned[r] ? `${id} (learned)` : id)).join(', ')}`),
      `Unknown ids seen: ${d.unknown.join(', ') || 'none'}`,
      'Only + (ride:12) and − (ride:8) of the Click v2 bitmask are verified on real hardware; every other name is from an open-source table.',
    ];
    return lines.join('\n');
  }

  async function copy() {
    const text = reportText(); let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { /* niente */ } ta.remove();
    }
    st.msg = t(ok ? 'clickcheck.copied' : 'clickcheck.copyFail'); render();
    el.querySelector('.cc-report').open = true;
  }

  // ---- procedura guidata ----
  function startGuide() { st.mode = 'guide'; st.step = 0; st.run = {}; st.warn = ''; st.got = null; clearTimeout(st.timer); render(); }
  function stopGuide() { st.mode = 'live'; st.warn = ''; st.got = null; clearTimeout(st.timer); render(); }
  function advance() {
    st.step++; st.got = null; st.warn = '';
    if (st.step >= steps().length) { // finito: la mappatura è "confermata dall'utente"
      st.mode = 'done';
      for (const k of click.kinds.length ? click.kinds : [kind() || 'v1']) click.confirm(k);
    }
    render();
  }
  function learnStep(id) {
    if (st.mode !== 'guide' || st.got) return;
    const step = steps()[st.step]; const role = step === 'y' || step === 'z' ? 'menu' : step;
    if (st.run[id] && st.run[id] !== step) { st.warn = t('clickcheck.dup', { role: roleName(st.run[id] === 'y' || st.run[id] === 'z' ? 'menu' : st.run[id]) }); render(); return; }
    st.run[id] = step; click.learn(id, role);
    st.got = id; st.warn = ''; render();
    st.timer = setTimeout(advance, 450);
  }

  // ---- eventi del controller ----
  const onPress = (e) => {
    if (!open) return;
    const { id, role } = e.detail;
    st.last = { id, role };
    st.lit.add(id);
    learnStep(id);
    render();
  };
  const onRelease = (e) => { if (!open) return; st.lit.delete(e.detail.id); paintKeys(); };
  const refresh = () => { if (open) render(); };
  for (const ev of ['kind', 'rolechange', 'unknown', 'disconnected', 'connected']) click.addEventListener(ev, refresh);
  click.addEventListener('press', onPress);
  click.addEventListener('release', onRelease);

  // apertura automatica la prima volta che si collega un modello (mai mentre si pedala)
  const seen = () => { try { return (localStorage.getItem('clickCheckSeen') || '').split(',').filter(Boolean); } catch { return ['x']; } };
  click.addEventListener('connected', (e) => {
    const m = e.detail?.model || 'click';
    if (seen().includes(m) || playing()) return;
    try { localStorage.setItem('clickCheckSeen', [...seen(), m].join(',')); } catch { /* niente storage */ }
    api.open();
  });

  // ---- vista ----
  function build() {
    el = document.createElement('div'); el.id = 'clickCheck'; el.className = 'cc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.hidden = true;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cc]'); if (!b) return;
      const a = b.dataset.cc;
      if (a === 'close') api.close();
      else if (a === 'start') startGuide();
      else if (a === 'stop') stopGuide();
      else if (a === 'skip') advance();
      else if (a === 'reset') { click.resetMap(kind()); st.mode = 'live'; st.run = {}; st.msg = ''; render(); }
      else if (a === 'copy') copy();
    });
    document.body.appendChild(el);
  }
  function paintKeys() {
    if (!el) return;
    const on = new Set([...st.lit].map((id) => slotFor(id, click.roleOf(id))));
    const present = new Set([...el.querySelectorAll('[data-slot]')].map((g) => g.dataset.slot));
    // un tasto il cui slot non è nel disegno (es. "Su" su un Click v1) accende il "?"
    if ([...on].some((x) => !present.has(x))) on.add('?');
    el.querySelectorAll('[data-slot]').forEach((g) => g.classList.toggle('on', on.has(g.dataset.slot)));
  }
  function render() {
    if (!el || !open) return;
    const k = kind(); const connected = click.connected;
    const d = click.reportData();
    const last = st.last;
    const lastName = !last ? '' : last.role ? roleName(last.role) : NAME_SLOT[last.id] ? GLYPH[NAME_SLOT[last.id]] : t('clickcheck.unknownKey');
    const stepList = steps(); const cur = stepList[st.step];
    let guide = '';
    if (st.mode === 'guide') {
      const label = cur === 'y' || cur === 'z' ? GLYPH[cur] : roleName(cur);
      guide = `<div class="cc-step"><span class="cc-count">${esc(t('clickcheck.stepOf', { n: st.step + 1, total: stepList.length }))}</span>
        <b class="cc-ask">${esc(t('clickcheck.press', { key: label }))}${OPTIONAL.has(cur) ? ` <small>(${esc(t('clickcheck.optional'))})</small>` : ''}</b>
        <span class="cc-got">${st.got ? esc(t('clickcheck.got', { id: st.got })) : st.warn ? esc(st.warn) : esc(t('clickcheck.waiting'))}</span>
        <div class="cc-row"><button type="button" data-cc="skip" data-primary>${esc(t('clickcheck.skip'))}</button><button type="button" class="ghost" data-cc="stop">${esc(t('clickcheck.stopMap'))}</button></div></div>`;
    } else {
      guide = `<div class="cc-step">${st.mode === 'done' ? `<b class="cc-ask">${esc(t('clickcheck.done'))}</b>` : ''}<button type="button" data-cc="start" data-primary>${esc(t(st.mode === 'done' ? 'clickcheck.restart' : 'clickcheck.start'))}</button></div>`;
    }
    const table = ROLES.filter((r) => d.rows[r]).map((r) => `<li data-role="${r}"><span>${esc(roleName(r))}</span><code>${esc(d.rows[r].join(' · '))}</code></li>`).join('');
    el.innerHTML = `<div class="cc-box">
      <header class="cc-head"><h2>${esc(t('clickcheck.title'))}</h2><button type="button" class="close" data-cc="close" aria-label="${esc(t('clickcheck.close'))}">✕</button></header>
      <p class="cc-model">${connected ? esc(d.kinds.length ? d.kinds.map((x) => KIND_NAMES[x]).join(' + ') : click.label) : esc(t('clickcheck.none'))}${connected && !k ? `<br><small>${esc(t('clickcheck.detect'))}</small>` : ''}</p>
      <div class="cc-pad" data-kind="${drawKind()}">${drawing(drawKind())}</div>
      <div class="cc-live" aria-live="polite"><div class="cc-name">${last ? esc(lastName) : '—'}</div><div class="cc-raw">${last ? esc(last.id) : esc(t('clickcheck.live'))}</div></div>
      ${guide}
      <p class="cc-conf ${d.confirmed ? 'ok' : ''}">${esc(t(d.confirmed ? 'clickcheck.confirmed' : 'clickcheck.unconfirmed'))}</p>
      <h3 class="cc-h">${esc(t('clickcheck.table'))}</h3><ul class="cc-table">${table || '<li>—</li>'}</ul>
      ${d.unknown.length ? `<p class="cc-unk-list">${esc(t('clickcheck.unknownSeen'))}: <code>${esc(d.unknown.join(', '))}</code></p>` : ''}
      <p class="cc-msg" role="status">${esc(st.msg)}</p>
      <div class="cc-actions"><button type="button" data-cc="copy">${esc(t('clickcheck.copy'))}</button><button type="button" class="ghost" data-cc="reset">${esc(t('clickcheck.reset'))}</button><button type="button" class="ghost" data-cc="close">${esc(t('clickcheck.close'))}</button></div>
      <details class="cc-report"><summary>${esc(t('clickcheck.report'))}</summary><pre>${esc(reportText())}</pre></details>
    </div>`;
    paintKeys();
    el.querySelector('.cc-box').dataset.mode = st.mode;
  }

  const api = {
    isOpen: () => open,
    open() {
      if (!el) build();
      open = true; el.hidden = false; st.mode = 'live'; st.last = null; st.lit.clear(); st.msg = ''; st.warn = '';
      document.body.classList.add('cc-open');
      render();
      el.querySelector('[data-primary]')?.focus({ preventScroll: true });
    },
    close() {
      if (!open) return;
      open = false; el.hidden = true; clearTimeout(st.timer); document.body.classList.remove('cc-open');
    },
    reportText,
  };
  return api;
}
