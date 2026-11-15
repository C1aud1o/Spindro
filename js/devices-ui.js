// Pannello "Dispositivi": per ogni dispositivo ruolo, stato, segno di vita (età dell'ultimo dato), batteria, protocollo e una riga
// in parole semplici; "Prova il rullo"; i pulsanti "Aggiungi dispositivo" e "Ricollega"; la scelta della fonte di potenza e cadenza.
// Tutto raggiungibile col Click (bottoni e select veri). Spiegazione per l'utente: docs/connecting-devices.md.
import { POWER_OPTIONS, CADENCE_OPTIONS } from './sources.js';
import { roleKeys } from './connect.js';

const ROLE_KEY = { trainer: 'devices.role.trainer', hr: 'devices.role.hr', click: 'devices.role.click', power: 'devices.role.power', cadence: 'devices.role.cadence', '?': 'devices.role.unknown' };
const PROTO = { ftms: 'FTMS', fec: 'FE-C', wahoo: 'Wahoo', basic: 'CP/CSC' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Il riquadro d'aiuto per un problema di collegamento: titolo, causa in una frase, cosa fare (per piattaforma), pulsanti.
 *  `problem` = { code, name, services, platform }. Lo usano sia la home sia il pannello. */
export function problemHtml(problem, t, { retryId = '', reportId = '' } = {}) {
  const { code = 'noDevice', name = '', services = [], platform = 'desktop', reason = 'other' } = problem;
  if (code === 'browser') return `<b>${esc(t('connect.err.browser.title'))}</b><p>${esc(t(`connect.unsupported.${reason}`))}</p>`;
  const generic = ['noDevice', 'cancelled', 'unknown'].includes(code);
  const list = (keys) => `<ul>${keys.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>`;
  let title; let body = ''; let steps;
  if (generic) { title = t('connectHelp.title'); steps = list(['connectHelp.bluetooth', 'connectHelp.wake', 'connectHelp.apps', 'connectHelp.near']); }
  else {
    title = t(`connect.err.${code}.title`, { name: name || t('devices.unnamed') });
    body = `<p>${esc(t(`connect.err.${code}.body`, { name: name || t('devices.unnamed'), services: services.join(', ') || '—' }))}</p>`;
    if (code === 'off' || code === 'permission') steps = `<p><b>${esc(t(`connect.fix.${code}.${platform}`))}</b></p>`;
    else if (code === 'busy') steps = list(['connectHelp.apps', 'connectHelp.wake', 'connectHelp.near']);
    else steps = '';
  }
  const reportable = !['off', 'permission'].includes(code);
  const btn = (id, act, label) => `<button class="ghost"${id ? ` id="${id}"` : ''} data-act="${act}">${esc(label)}</button>`;
  const retryLabel = code === 'unsupportedDevice' ? t('connect.chooseOther') : t('connectHelp.retry');
  return `<b>${esc(title)}</b>${body}${steps}<div class="row2">${btn(retryId, 'retry', retryLabel)}${reportable ? btn(reportId, 'report', code === 'unsupportedDevice' ? t('connect.report') : t('trainerReport.button')) : ''}</div>`;
}

export function initDevicesUi({ hub, trainer, hrm, click, src, prefs, setPref, addDevice, reconnect, openSheet, closeSheet, t, openClickCheck, testTrainer, isRiding = () => false, onProblemAction }) {
  const $ = (id) => document.getElementById(id);
  let testStatus = ''; // testo della prova in corso o appena finita
  let testing = false;

  /** Ruolo mostrato: il sensore CSC è "cadenza", "velocità" o entrambe, secondo ciò che ha mandato. */
  function roleLabel(entry, role) {
    if (role === 'cadence') {
      const m = hub.meters.find((x) => x.entry === entry) || entry.meter;
      if (m?.hasWheel && m?.hasCadence) return t('devices.role.cadenceSpeed');
      if (m?.hasWheel && !m?.hasCadence) return t('devices.role.speed');
    }
    if (role === 'trainer' && trainer.device === entry.device && trainer.protocol) return `${t(ROLE_KEY.trainer)} · ${PROTO[trainer.protocol] || ''}`.replace(/ · $/, '');
    if (role === 'power') { const m = entry.meter; if (m?.hasCadence) return `${t(ROLE_KEY.power)} + ${t('home.cadence').toLowerCase()}`; }
    return t(ROLE_KEY[role] || ROLE_KEY['?']);
  }
  const protoOf = (entry, role) => {
    if (role === 'trainer') return trainer.device === entry.device && trainer.protocol ? PROTO[trainer.protocol] : '';
    if (role === 'hr') return 'Heart Rate';
    if (role === 'click') return click.label || 'Zwift';
    if (role === 'power') return 'Cycling Power';
    if (role === 'cadence') return 'Speed & Cadence (CSC)';
    return '';
  };
  const why = (entry, role) => {
    if (role === 'trainer') return t(trainer.device === entry.device && trainer.connected && !trainer.controllable ? 'devices.why.trainerReadOnly' : 'devices.why.trainer');
    return t(`devices.why.${role === '?' ? 'unknown' : role}`);
  };
  function life(entry) {
    if (entry.state !== 'connected') return '';
    if (!entry.lastData) return { text: t(entry.roles.includes('click') && entry.roles.length === 1 ? 'devices.life.click' : 'devices.life.none'), cls: '' };
    const s = Math.max(0, Math.round((Date.now() - entry.lastData) / 1000));
    return s < 3 ? { text: t('devices.life.live'), cls: 'live' } : { text: t('devices.life.ago', { s }), cls: s > 10 ? 'stale' : '' };
  }
  const stateText = (e) => {
    if (e.state === 'reconnecting') return t('devices.nextTry', { s: Math.max(0, Math.ceil(((e.nextTry || Date.now()) - Date.now()) / 1000)) });
    if (e.state === 'lost') return t('devices.lost');
    return t('devices.connected');
  };

  function renderList() {
    const box = $('deviceList');
    const known = hub.pending;
    if (!hub.entries.length && !known.length) { box.innerHTML = `<p class="dev-empty">${esc(t(hub.busy ? 'status.connecting' : 'devices.none'))}</p>`; return; }
    const idle = !isRiding();
    const cards = hub.entries.map((e, i) => {
      const up = e.state === 'connected';
      const roles = e.roles.map((r) => `<span class="pill ${up ? 'ok' : 'warn'}">${esc(roleLabel(e, r))}</span>`).join(' ');
      const bat = e.battery != null ? `<span class="dev-bat" title="${esc(t('devices.battery'))}">${e.battery}%</span>` : '';
      const sw = e.switchable ? `<label class="lang-pick dev-role"><span class="fine">${esc(t('devices.changeRole'))}</span><select data-role="${i}" aria-label="${esc(t('devices.changeRole'))}">
        <option value="trainer"${e.roles[0] === 'trainer' ? ' selected' : ''}>${esc(t('devices.role.trainer'))}</option>
        <option value="power"${e.roles[0] === 'power' ? ' selected' : ''}>${esc(t('devices.role.power'))}</option></select></label>` : '';
      const roleList = roleKeys(e.roles);
      const explain = roleList.map((r) => why(e, r)).join(' ');
      const multi = roleList.length > 1 ? `<p class="fine">${esc(t('devices.why.multi', { roles: roleList.map((r) => t(ROLE_KEY[r]).toLowerCase()).join(' + ') }))}</p>` : '';
      const protos = [...new Set(roleList.map((r) => protoOf(e, r)).filter(Boolean))].join(' · ');
      const lf = life(e);
      const isTrainer = e.roles.includes('trainer') && trainer.device === e.device;
      const canTest = up && isTrainer && trainer.controllable;
      const test = canTest ? `<button class="ghost" data-test="${i}"${testing || !idle ? ' disabled' : ''}>${esc(t('devices.test.button'))}</button>
        <p class="fine dev-test-note">${esc(testStatus || t(idle ? 'devices.test.note' : 'devices.test.ride'))}</p>` : '';
      const retry = e.state === 'lost' ? `<button class="cta-sm" data-retrylost="1">${esc(t('devices.retryNow'))}</button>` : '';
      return `<div class="dev-card ${up ? '' : 'dev-down'}"><div class="dev-top"><b class="dev-name">${esc(e.name || t('devices.unnamed'))}</b>${bat}</div>
        <div class="dev-roles">${roles}<span class="dev-state">${esc(stateText(e))}</span></div>
        <p class="fine dev-why">${esc(explain)}</p>${multi}
        <p class="fine dev-meta">${protos ? `<span>${esc(t('devices.proto', { p: protos }))}</span>` : ''}${lf ? ` <span class="dev-life ${lf.cls}">${esc(lf.text)}</span>` : ''}</p>${sw}${test}${retry}
        <button class="ghost" data-remove="${i}">${esc(t('ui.disconnect'))}</button></div>`;
    });
    const pend = known.map((k, i) => `<div class="dev-card dev-down"><div class="dev-top"><b class="dev-name">${esc(k.name || t('devices.unnamed'))}</b></div>
      <div class="dev-roles">${roleKeys(k.roles).map((r) => `<span class="pill">${esc(t(ROLE_KEY[r]))}</span>`).join(' ')}<span class="dev-state">${esc(t(k.state === 'reconnecting' ? 'devices.reconnecting' : k.state === 'failed' ? 'devices.notFound' : 'devices.tapToReconnect'))}</span></div>
      <button class="ghost" data-forget="${i}">${esc(t('devices.forget'))}</button></div>`);
    box.innerHTML = cards.concat(pend).join('') + (click.connected ? `<button class="ghost" id="clickCheckOpen">${esc(t('clickcheck.open'))}</button>` : '');
    $('clickCheckOpen')?.addEventListener('click', () => openClickCheck?.());
    box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => hub.remove(hub.entries[+b.dataset.remove])));
    box.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', () => hub.forget(hub.pending[+b.dataset.forget].id)));
    box.querySelectorAll('[data-retrylost]').forEach((b) => b.addEventListener('click', () => hub.retryLost()));
    box.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', runTest));
    box.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
      try { await hub.setRole(hub.entries[+s.dataset.role], s.value); } catch (err) { error(err); }
    }));
  }

  async function runTest() {
    if (testing || isRiding()) return;
    testing = true; testStatus = t('devices.test.running', { n: 1, total: 3 }); update();
    const res = await testTrainer((n, total) => { testStatus = t('devices.test.running', { n, total }); update(); });
    testing = false;
    testStatus = t(res === 'done' ? 'devices.test.done' : res === 'aborted' ? 'devices.test.aborted' : res === 'unavailable' ? 'devices.test.readOnly' : 'devices.test.failed');
    update();
    setTimeout(() => { testStatus = ''; update(); }, 12000);
  }

  function fill(sel, options, current, label) {
    const keep = sel.value;
    sel.innerHTML = options.map((o) => `<option value="${o}">${esc(label(o))}</option>`).join('');
    sel.value = options.includes(current) ? current : 'auto';
    if (document.activeElement === sel && keep) sel.value = keep;
  }
  function renderSources() {
    const pm = hub.meters.find((m) => m.connected && m.kind === 'power');
    const csc = hub.meters.find((m) => m.connected && m.kind === 'csc');
    const havePower = ['auto', 'trainer', ...(pm ? ['meter'] : [])];
    const haveCad = ['auto', ...(csc ? ['csc'] : []), ...(pm ? ['meter'] : []), ...(trainer.connected && trainer.hasCadence ? ['trainer'] : []), 'estimate'];
    const name = (k) => t(`devices.src.${k}`);
    fill($('srcPower'), POWER_OPTIONS.filter((o) => havePower.includes(o)), prefs.power, (o) => (o === 'auto' ? `${name('auto')} (${name(src.power)})` : name(o)));
    fill($('srcCadence'), CADENCE_OPTIONS.filter((o) => haveCad.includes(o)), prefs.cadence, (o) => (o === 'auto' ? `${name('auto')} (${name(src.cadence)})` : name(o)));
    $('srcNote').textContent = (src.cadence === 'estimate' ? t('devices.cadenceEstimated') : t('devices.cadenceReal')) + (pm && !trainer.connected ? ` ${t('devices.noTrainerNote')}` : '');
    $('sourcesGroup').hidden = !hub.entries.length;
  }

  $('srcPower').addEventListener('change', (e) => setPref('power', e.target.value));
  $('srcCadence').addEventListener('change', (e) => setPref('cadence', e.target.value));
  $('addDevice').addEventListener('click', async () => {
    $('devMsg').hidden = true;
    await addDevice();
    update();
  });
  $('reconnectDevice').addEventListener('click', async () => { $('devMsg').hidden = true; await reconnect(); update(); });
  $('devMsg').addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (a) onProblemAction?.(a.dataset.act); });

  function update() {
    if ($('devicesSheet').hidden) return;
    renderList(); renderSources();
    const next = hub.needsTap[0];
    $('reconnectDevice').hidden = !next;
    $('reconnectDevice').textContent = next ? t('devices.reconnectNext', { name: next.name || t('devices.unnamed') }) : '';
    $('reconnectDevice').disabled = hub.busy;
    $('addDevice').classList.toggle('cta', !next); $('addDevice').classList.toggle('ghost', !!next);
    $('addDevice').textContent = hub.entries.length || hub.pending.length ? t('devices.addAnother') : t('devices.add');
    $('addDevice').disabled = hub.busy;
  }
  // il segno di vita ("ultimo dato 4 s fa") si aggiorna ogni secondo, solo a pannello aperto
  setInterval(update, 1000);
  function open() { $('devMsg').hidden = true; openSheet('devicesSheet'); update(); hub.refreshBattery().catch(() => {}); }
  /** Mostra il problema nel pannello (se aperto). */
  function error(problem) {
    const m = $('devMsg');
    m.innerHTML = problemHtml(problem || { code: 'noDevice' }, t);
    m.hidden = $('devicesSheet').hidden;
  }
  return { open, update, error };
}
