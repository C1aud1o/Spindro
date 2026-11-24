// Vista della "finestra mini" (Document Picture-in-Picture): costruzione e aggiornamento del DOM, senza stato né API del browser.
// Funziona su qualsiasi Document (anche quello della finestra PiP, o uno finto nei test). Il testo arriva da t() (js/i18n.js).
const ACTIONS = ['pause', 'biasDown', 'biasUp', 'remote', 'spindro', 'close'];

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
}
function stat(doc, key, label) {
  const d = el(doc, 'div', `mini-stat m-${key}`);
  d.append(el(doc, 'dt', null, label), (() => { const dd = el(doc, 'dd'); dd.append(el(doc, 'b', null, '--')); dd.dataset.f = key; return dd; })());
  return d;
}

/** Costruisce la vista dentro `doc.body` (o `host`). Ritorna { root, paint(model), buttons }. `on(action)` è chiamato dai pulsanti. */
export function buildMini(doc, t, on = () => {}, host = doc.body) {
  const root = el(doc, 'div', 'mini'); root.setAttribute('role', 'region'); root.setAttribute('aria-label', t('mini.title'));
  const top = el(doc, 'div', 'mini-top');
  const mode = el(doc, 'span', 'mini-mode'); mode.dataset.f = 'mode';
  const paused = el(doc, 'span', 'mini-paused', t('mini.paused')); paused.dataset.f = 'paused';
  top.append(mode, paused);

  const power = el(doc, 'div', 'mini-power');
  const pv = el(doc, 'b', 'mini-w', '0'); pv.dataset.f = 'power';
  const tgt = el(doc, 'span', 'mini-tgt'); tgt.dataset.f = 'target';
  power.append(pv, el(doc, 'small', null, 'W'), tgt);

  const step = el(doc, 'div', 'mini-step');
  const sn = el(doc, 'b', 'mini-stepname'); sn.dataset.f = 'step';
  const sl = el(doc, 'span', 'mini-left'); sl.dataset.f = 'left';
  step.append(sn, sl);
  const next = el(doc, 'p', 'mini-next'); next.dataset.f = 'next';
  const bar = el(doc, 'div', 'mini-bar'); const fill = el(doc, 'i'); fill.dataset.f = 'bar'; bar.append(fill);
  const clock = el(doc, 'p', 'mini-clock'); clock.dataset.f = 'clock';

  const stats = el(doc, 'dl', 'mini-stats');
  stats.append(stat(doc, 'cadence', t('mini.cadence')), stat(doc, 'hr', t('mini.hr')), stat(doc, 'bias', t('mini.bias')));
  const last = el(doc, 'p', 'mini-last'); last.dataset.f = 'last'; last.setAttribute('role', 'status');

  const acts = el(doc, 'div', 'mini-actions');
  const mk = (act, label, cls) => { const b = el(doc, 'button', `mini-btn ${cls || ''}`.trim(), label); b.type = 'button'; b.dataset.act = act; return b; };
  acts.append(mk('pause', t('mini.pause'), 'primary'), mk('biasDown', '−'), mk('biasUp', '+'), mk('remote', t('mini.remote')), mk('spindro', t('mini.back')), mk('close', t('mini.close')));
  acts.addEventListener('click', (e) => { const b = e.target.closest?.('[data-act]'); if (b && ACTIONS.includes(b.dataset.act) && !b.disabled) on(b.dataset.act); });

  root.append(top, power, step, next, bar, clock, stats, last, acts);
  host.append(root);

  const f = (k) => root.querySelector(`[data-f="${k}"]`);
  const setText = (k, v) => { const n = f(k); const s = String(v ?? ''); if (n.textContent !== s) n.textContent = s; };
  const setStat = (k, v) => { const b = f(k).firstChild; const s = String(v ?? '--'); if (b.textContent !== s) b.textContent = s; };
  const btn = (a) => root.querySelector(`[data-act="${a}"]`);
  let lastPause = null;

  function paint(m) {
    root.dataset.mode = m.mode === 'remote' ? 'remote' : 'spindro';
    root.dataset.paused = m.paused ? '1' : '0';
    root.dataset.workout = m.workout ? '1' : '0';
    setText('mode', m.mode === 'remote' ? t('mini.modeRemote') : t('mini.modeSpindro'));
    f('paused').hidden = !m.paused;
    setText('power', Math.round(m.power || 0));
    setText('target', m.target != null ? `${t('mini.target')} ${m.target} W${m.pct != null ? ` · ${m.pct}%` : ''}` : '');
    setText('step', m.step || t('mini.freeRide'));
    setText('left', m.left || '');
    setText('next', m.next || '');
    setText('clock', m.total ? `${m.elapsed} / ${m.total}` : m.elapsed || '');
    fill.style.width = `${Math.round(Math.min(1, Math.max(0, m.progress || 0)) * 100)}%`;
    bar.hidden = !m.total;
    setStat('cadence', m.cadence); setStat('hr', m.hr); setStat('bias', m.bias);
    setText('last', m.last || '');
    const pauseLabel = m.paused ? t('mini.resume') : t('mini.pause');
    if (lastPause !== pauseLabel) { btn('pause').textContent = pauseLabel; lastPause = pauseLabel; }
    const adj = m.adjust === 'bias' ? t('mini.adjBias') : t('mini.adjWatts');
    for (const a of ['biasDown', 'biasUp']) { btn(a).title = adj; btn(a).setAttribute('aria-label', `${adj} ${a === 'biasUp' ? '+' : '−'}`); }
    // in modalità Remote il pulsante porta a "Spindro" e viceversa (stesso tasto = cambia modalità); senza estensione non si offre
    const rb = btn('remote'); rb.hidden = !m.remoteAvailable; rb.textContent = m.mode === 'remote' ? t('mini.toSpindro') : t('mini.toRemote'); rb.setAttribute('aria-pressed', m.mode === 'remote' ? 'true' : 'false');
  }
  return { root, paint, buttons: ACTIONS };
}
