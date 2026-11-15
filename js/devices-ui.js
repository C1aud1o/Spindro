// Pannello "Dispositivi": elenco di ciò che è collegato (ruolo, stato, batteria, Scollega), un solo pulsante
// "Aggiungi dispositivo", e la scelta della fonte di potenza e cadenza. Tutto raggiungibile col Click (bottoni e select veri).
import { POWER_OPTIONS, CADENCE_OPTIONS } from './sources.js';

const ROLE_KEY = { trainer: 'devices.role.trainer', hr: 'devices.role.hr', click: 'devices.role.click', power: 'devices.role.power', cadence: 'devices.role.cadence', '?': 'devices.role.unknown' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initDevicesUi({ hub, trainer, hrm, click, src, prefs, setPref, addDevice, openSheet, closeSheet, t }) {
  const $ = (id) => document.getElementById(id);

  /** Ruolo mostrato: il sensore CSC è "cadenza", "velocità" o entrambe, secondo ciò che ha mandato. */
  function roleLabel(entry, role) {
    if (role === 'cadence') {
      const m = hub.meters.find((x) => x.entry === entry);
      if (m?.hasWheel && m?.hasCadence) return t('devices.role.cadenceSpeed');
      if (m?.hasWheel && !m?.hasCadence) return t('devices.role.speed');
    }
    if (role === 'trainer' && trainer.connected && trainer.device === entry.device) return `${t(ROLE_KEY.trainer)} · ${trainer.protocol ? ({ ftms: 'FTMS', fec: 'FE-C', wahoo: 'Wahoo', basic: 'CP/CSC' })[trainer.protocol] : ''}`.replace(/ · $/, '');
    if (role === 'power') { const m = hub.meters.find((x) => x.entry === entry); if (m?.hasCadence) return `${t(ROLE_KEY.power)} + ${t('home.cadence').toLowerCase()}`; }
    return t(ROLE_KEY[role] || ROLE_KEY['?']);
  }

  function renderList() {
    const box = $('deviceList');
    if (!hub.entries.length) { box.innerHTML = `<p class="dev-empty">${esc(t(hub.busy ? 'status.connecting' : 'devices.none'))}</p>`; return; }
    box.innerHTML = hub.entries.map((e, i) => {
      const roles = e.roles.map((r) => `<span class="pill ok">${esc(roleLabel(e, r))}</span>`).join(' ');
      const bat = e.battery != null ? `<span class="dev-bat" title="${esc(t('devices.battery'))}">${e.battery}%</span>` : '';
      const sw = e.switchable ? `<label class="lang-pick dev-role"><span class="fine">${esc(t('devices.changeRole'))}</span><select data-role="${i}" aria-label="${esc(t('devices.changeRole'))}">
        <option value="trainer"${e.roles[0] === 'trainer' ? ' selected' : ''}>${esc(t('devices.role.trainer'))}</option>
        <option value="power"${e.roles[0] === 'power' ? ' selected' : ''}>${esc(t('devices.role.power'))}</option></select></label>` : '';
      return `<div class="dev-card"><div class="dev-top"><b class="dev-name">${esc(e.name || t('devices.unnamed'))}</b>${bat}</div>
        <div class="dev-roles">${roles}<span class="dev-state">${esc(t('devices.connected'))}</span></div>${sw}
        <button class="ghost" data-remove="${i}">${esc(t('ui.disconnect'))}</button></div>`;
    }).join('');
    box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => hub.remove(hub.entries[+b.dataset.remove])));
    box.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
      try { await hub.setRole(hub.entries[+s.dataset.role], s.value); } catch (err) { error(err); }
    }));
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
    $('srcNote').textContent = src.cadence === 'estimate' ? t('devices.cadenceEstimated') : t('devices.cadenceReal');
    $('sourcesGroup').hidden = !hub.entries.length;
  }

  $('srcPower').addEventListener('change', (e) => setPref('power', e.target.value));
  $('srcCadence').addEventListener('change', (e) => setPref('cadence', e.target.value));
  $('addDevice').addEventListener('click', async () => {
    $('devMsg').hidden = true;
    const had = hub.entries.length;
    await addDevice();
    update();
    if (hub.entries.length > had) $('addDevice').textContent = t('devices.addAnother');
  });

  function update() {
    if ($('devicesSheet').hidden) return;
    renderList(); renderSources();
    $('addDevice').textContent = hub.entries.length ? t('devices.addAnother') : t('devices.add');
    $('addDevice').disabled = hub.busy;
  }
  function open() { $('devMsg').hidden = true; openSheet('devicesSheet'); update(); }
  function error() {
    const m = $('devMsg');
    m.innerHTML = `<b>${esc(t('connectHelp.title'))}</b><br>${['bluetooth', 'wake', 'apps', 'near'].map((k) => `• ${esc(t(`connectHelp.${k}`))}`).join('<br>')}`;
    m.hidden = $('devicesSheet').hidden;
  }
  return { open, update, error };
}
