import { t, LANGS, setLang, getLang, fmtDate, fmtDec, fmtNum } from './i18n.js'; // per primo: carica le traduzioni prima del render
import { isNative, GarminBridge, BLE } from './native.js'; // nell'app installa il Bluetooth nativo
import { Trainer } from './trainers/index.js';
import { Devices } from './devices.js';
import { initDevicesUi, problemHtml } from './devices-ui.js';
import { detectSupport, explainError, nextSuggestion } from './connect.js';
import { runTrainerTest } from './trainer-test.js';
import { pickPower, pickCadence } from './sources.js';
import { SensorDebug } from './debug.js';
import { BUILD, CHANNEL } from './build.js';
import { watchGuide, GARMIN_RE, WATCH_BRANDS, brandGuide } from './watchguide.js';
import { ZwiftClick } from './click.js';
import { GEARS, virtualSpeed, powerForSpeed } from './gears.js';
import { HeartRate } from './hr.js';
import { encodeFit, encodeWorkoutFit, encodeZwo } from './fit.js';
import { Strava } from './strava.js';
import { STRAVA_PROXY, GOATCOUNTER_URL, SENTRY_DSN, SITE_URL } from './config.js';
import { initMonitoring, track, consentAsked, consentGiven, setConsent } from './monitor.js';
import { buildReportUrl } from './report.js';
import { setupDebug } from './debugview.js';
import { rideStats, renderHistory } from './history.js';
// glowSetting vive qui (stessa chiave di games/kit3d.js) per non caricare three.js all'avvio
const glowSetting = { get on() { return localStorage.getItem('gameGlow') !== '0'; }, set on(v) { localStorage.setItem('gameGlow', v ? '1' : '0'); } };
import './ui.js';
import { coach, spokenTime } from './coach.js';
import { party, badges } from './celebrate.js';
import { initAccount, dataChanged, accountsAvailable, submitGameScore, renderBoards } from './account/index.js';
import * as challenges from './challenges.js';
import { initPlans } from './plans-ui.js';
import { loadFactor, runCalibration, DEFAULT_FACTOR } from './calibrate.js';
import { createClickNav } from './clicknav.js';
import { createClickCheck } from './clickcheck.js';
import { ask } from './dialog.js';
import { parseGpx, at as routeAt, SAMPLES as ROUTES, drawElevation, drawMap } from './route.js';
import { workouts, WorkoutRunner, drawProfile, duration, tss, fmtTime as fmtClock, parseZwo } from './workouts.js';
import { GameAudio } from './games/audio.js';
import { Progress } from './games/progress.js';

const $ = (id) => document.getElementById(id);
const trainer = new Trainer();
const pmDbg = new SensorDebug('pm', 'Power meter / cadence');
const garminDbg = { dbg: new SensorDebug('garmin', 'Garmin bridge') };
const click = new ZwiftClick();
const hrm = new HeartRate();
const liveRide = () => !!(state.ride.running || workout); // pedalando adesso (uscita in corso o allenamento)
const hub = new Devices({ trainer, click, hrm, ask, meterDbg: pmDbg, isRiding: () => liveRide() }); // tutti i dispositivi Bluetooth (js/devices.js)

const MAX_W = 600; // limite dichiarato del Van Rysel D100

// Modalità di partenza: ERG per chi non ne ha mai scelta un'altra (la scelta fatta a mano si ricorda)
const MODES = ['erg', 'gears', 'sim', 'resistance'];
const readStore = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, v); } catch { /* niente storage */ } };
const savedMode = MODES.includes(readStore('mode')) ? readStore('mode') : null;
const state = {
  mode: savedMode || 'erg',
  gear: 11, // indice (0-based) => marcia 12
  grade: 0,
  erg: 150, // si calcola subito sotto: 60% della FTP, o l'ultimo valore scelto a mano
  resistance: 30,
  mass: Number(localStorage.getItem('mass')) || 80,
  ftp: Number(localStorage.getItem('ftp')) || 200,
  data: { power: 0, cadence: 0, speed: 0, hr: null },
  cadenceSmooth: 0,
  speedSmooth: 0, // m/s dal rullo, smussata
  lastSent: null,
  lastSentAt: 0,
  ride: { running: false, start: 0, elapsed: 0, distance: 0, energy: 0, powerSum: 0, samples: 0, log: [], saved: true },
  hrFromSensor: false,
};
// Obiettivo dell'ERG libero: 60% della FTP finché non lo si cambia a mano, poi si ricorda l'ultimo valore
const ergDefault = () => Math.min(600, Math.max(50, Math.round(state.ftp * 0.6 / 5) * 5));
let ergTouched = Number(readStore('ergW')) >= 0 && readStore('ergW') != null;
state.erg = ergTouched ? Math.min(600, Number(readStore('ergW'))) : ergDefault();
const rememberErg = () => { ergTouched = true; writeStore('ergW', String(state.erg)); };

// ---------- UI helpers ----------
function log(msg) {
  const el = $('log');
  if (!el) return;
  el.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n` + el.textContent.slice(0, 2000);
}
function setStatus(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('ok', !!ok);
  el.closest('.dv')?.classList.toggle('on', !!ok);
}
function fmtTime(s) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
  return (h ? `${h}:` : '') + `${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
}

const support = detectSupport({ ua: navigator.userAgent, native: isNative, hasBluetooth: 'bluetooth' in navigator, secure: window.isSecureContext !== false });
if (!support.ok) {
  // dice onestamente perché e cosa fare, secondo la piattaforma (iPhone/iPad: nessun browser ha Web Bluetooth)
  $('unsupported').textContent = t(`connect.unsupported.${support.reason}`); $('unsupported').hidden = false;
  window.addEventListener('langchange', () => { $('unsupported').textContent = t(`connect.unsupported.${support.reason}`); });
  $('deviceBar').disabled = true;
}

// ---------- Connessioni ----------
// Una sola scelta Bluetooth ("Aggiungi dispositivo"): js/devices.js legge i servizi e assegna il ruolo (rullo, comandi, cardio,
// misuratore di potenza, sensore di cadenza). Qui sotto: cosa fa l'app quando un ruolo si collega o si scollega.
let lastTrainer = null; // nome, protocollo, funzioni e servizi del rullo collegato (per "Segnala il tuo rullo")
let lastProblem = null; // l'ultimo problema di collegamento mostrato (per "Riprova" e "Segnala")
const setPickHint = () => { $('pickHint').textContent = t(isNative ? 'connect.pickApp' : 'connect.pick'); };
setPickHint(); window.addEventListener('langchange', setPickHint);
/** Bluetooth spento? Dove la piattaforma lo dice (Chrome: getAvailability, app: il plugin); in dubbio no. */
async function bluetoothOff() {
  try {
    if (isNative) return (await BLE?.isEnabled?.())?.value === false;
    return (await navigator.bluetooth.getAvailability?.()) === false;
  } catch { return false; }
}
function showProblem(problem) {
  lastProblem = { platform: support.platform, ...problem };
  $('connectHelp').innerHTML = problemHtml(lastProblem, t, { retryId: 'connectHelpRetry', reportId: 'connectHelpReport' });
  $('connectHelp').hidden = false;
  devicesUi?.error(lastProblem);
}
function problemFrom(err) {
  const code = explainError(err, { afterPick: !!err.afterPick });
  return { code, name: err.deviceName || err.unsupported?.name || '', services: err.unsupported?.services || [] };
}
async function addDevice({ kind = null, skipCheck = false } = {}) {
  if (hub.busy) return null;
  if (!support.ok) { showProblem({ code: 'browser', reason: support.reason }); return null; }
  if (!skipCheck && await bluetoothOff()) { showProblem({ code: 'off' }); return null; }
  try {
    const entry = await hub.add({ kind });
    $('connectHelp').hidden = true;
    return entry;
  } catch (err) {
    const p = problemFrom(err);
    if (p.code === 'already') { toast(err.deviceName ? t('devices.alreadyNamed', { name: err.deviceName }) : t('devices.already')); return null; }
    showProblem(p);
    log(`Device error: ${err.name || ''} ${err.message}`);
    return null;
  }
}
/** Il pulsante "Ricollega": passa i dispositivi già usati uno alla volta (serve il tocco se il browser non ricorda il permesso). */
async function reconnect() {
  if (hub.busy) return null;
  if (await bluetoothOff()) { showProblem({ code: 'off' }); return null; }
  try {
    const entry = await hub.reconnectNext();
    if (entry) $('connectHelp').hidden = true;
    return entry;
  } catch (err) {
    const p = problemFrom(err);
    if (p.code === 'cancelled') { toast(t('devices.tapToReconnect')); return null; }
    showProblem(p);
    log(`Reconnect error: ${err.name || ''} ${err.message}`);
    return null;
  }
}
const primaryConnect = () => (hub.needsTap.length ? reconnect() : addDevice());
window.rfDevices = { add: addDevice, reconnect, disconnectAll: () => hub.disconnectAll(), hub, ride: () => ({ running: state.ride.running, samples: state.ride.log.length, last: state.ride.log[state.ride.log.length - 1] || null }) }; // anche per i test

trainer.addEventListener('connected', (e) => {
  const { name, ftms, protocol, features } = e.detail;
  $('connectHelp').hidden = true;
  const proto = protocol && protocol !== 'CP/CSC' ? protocol : ftms ? 'FTMS' : '';
  setStatus('trainerStatus', `${name || t('home.trainer')}${proto ? ` · ${proto}` : ''}`, true);
  log(`Features: ERG ${features.power ? '✓' : '✗'} · Grade ${features.simulation ? '✓' : '✗'} · Resistance ${features.resistance ? '✓' : '✗'}`);
  if (!trainer.controllable) log('Trainer is read-only (no resistance control).');
  state.lastSent = null;
  trainerCadSeen = false;
  applyMode(true);
  lastTrainer = { name: name || '', protocol: protocol === 'CP/CSC' ? 'CPS' : (protocol || (ftms ? 'FTMS' : '')), features, services: [...trainer.services] };
  track('trainer', lastTrainer.protocol || 'unknown');
  offerTrainerReport(lastTrainer.name);
  refreshSources();
});
trainer.addEventListener('disconnected', async () => {
  setStatus('trainerStatus', t('home.status.none'));
  log('Trainer disconnected');
  // la registrazione continua, ma i watt del rullo caduto non devono restare "congelati" sull'ultimo valore
  if (src.power === 'trainer') state.data.power = 0;
  if (src.cadence === 'trainer') state.data.cadence = 0;
  state.data.speed = 0;
  state.lastSent = null; // al ricollegamento si rimanda lo stato (ERG / marcia / pendenza / passo dell'allenamento)
  refreshSources();
});
trainer.addEventListener('log', (e) => log(e.detail));
let trainerCadSeen = false;
trainer.addEventListener('data', (e) => {
  const d = { ...e.detail };
  if (!trainerCadSeen && trainer.hasCadence) { trainerCadSeen = true; refreshSources(); } // il rullo ha rivelato la cadenza
  if (state.hrFromSensor) delete d.hr; // la fascia/orologio ha la precedenza
  if (src.power !== 'trainer') delete d.power; // vince il misuratore di potenza
  if (src.cadence !== 'trainer') delete d.cadence; // vince il sensore di cadenza (o la stima)
  Object.assign(state.data, d);
  render();
});

click.addEventListener('connected', () => refreshDeviceBar());
click.addEventListener('disconnected', () => refreshDeviceBar());
// Controller Zwift: il driver emette ROLI (press / release con il ruolo, shift, hold, combo); vedi js/click.js e docs/click-navigazione.md
click.addEventListener('shift', (e) => { if (clickCheck.isOpen()) return; clickNav.sync(); if (clickNav.active) return; if (activeGame?.active) activeGame.input(e.detail); else step(e.detail); });
click.addEventListener('press', (e) => clickNav.key(e.detail.role, true));
click.addEventListener('release', (e) => clickNav.key(e.detail.role, false));
click.addEventListener('combo', () => { if (clickCheck.isOpen()) return; clearTimeout(mediaTimer); clickNav.toggle(); }); // + e − insieme (o il tasto Zwift) aprono/chiudono il menu
click.addEventListener('hold', (e) => {
  if (clickCheck.isOpen()) return;
  clickNav.sync();
  if (clickNav.active) return;
  if (activeGame?.active) activeGame.hold?.(e.detail);
  // pressione lunga = comandi musica (solo app Android): annulla il cambio fatto dalla pressione breve
  clearTimeout(mediaTimer);
  const d = e.detail;
  if (d > 0 && GarminBridge && $('musicOn').checked && !(activeGame?.active && activeGame.hold)) {
    mediaTimer = setTimeout(() => {
      if (activeGame?.active) activeGame.input(-d); else step(-d);
      GarminBridge.mediaKey({ key: 'next' }).then(() => toast(t('music.next'))).catch((err) => log(`Music: ${err.message}`));
    }, 800);
  }
});
let mediaTimer = null;
const playingNow = () => !!(state.ride.running || workout);
if (GarminBridge) {
  $('musicNative').hidden = false; $('musicWeb').hidden = true;
  $('musicOn').checked = localStorage.getItem('musicOn') === '1';
  $('musicOn').addEventListener('change', () => localStorage.setItem('musicOn', $('musicOn').checked ? '1' : '0'));
}

hrm.addEventListener('connected', () => {});
hrm.addEventListener('hr', (e) => { state.hrFromSensor = true; state.data.hr = e.detail; render(); });
hrm.addEventListener('disconnected', () => {
  state.hrFromSensor = false;
  state.data.hr = null;
  refreshDeviceBar();
});

// ---------- Misuratori di potenza e sensori di cadenza ----------
// Ogni dispositivo ha il suo ruolo (js/devices.js); se due danno lo stesso dato vince il sensore dedicato (js/sources.js).
const src = { power: 'trainer', cadence: 'estimate' }; // fonte in uso
const prefs = { power: 'auto', cadence: 'auto' };
try {
  prefs.power = localStorage.getItem('srcPower') || (localStorage.getItem('usePm') === '0' ? 'trainer' : 'auto'); // 'usePm' era l'interruttore di prima
  prefs.cadence = localStorage.getItem('srcCadence') || 'auto';
} catch { /* niente storage */ }
const meterOf = (kind) => hub.meters.find((m) => m.connected && m.kind === kind);
const cscSensor = () => hub.meters.find((m) => m.connected && m.kind === 'csc' && (m.hasCadence || !m.hasWheel)); // un sensore di sola ruota non dà la cadenza
/** Ricalcola da dove arrivano potenza e cadenza. */
function refreshSources() {
  const pmeter = meterOf('power');
  const have = { meter: !!pmeter, csc: !!cscSensor(), trainer: trainer.connected && trainer.hasCadence };
  const was = { ...src };
  src.power = pickPower(prefs.power, { meter: have.meter, trainer: true });
  src.cadence = pickCadence(prefs.cadence, { csc: have.csc, meter: !!(pmeter && pmeter.hasCadence), trainer: have.trainer });
  if (was.cadence !== src.cadence) state.data.cadence = 0;
  renderGearSettings?.();
  devicesUi?.update();
  render();
}
function onMeterData(m, d) {
  const mine = m.kind === 'power' ? 'meter' : 'csc';
  if (d.power != null && src.power === 'meter' && m.kind === 'power') state.data.power = d.power;
  if (d.cadence != null) {
    if (src.cadence === mine) state.data.cadence = d.cadence;
    else if (!m.cadSeen) { m.cadSeen = true; refreshSources(); } // il misuratore ha rivelato la cadenza: ricalcola la fonte
  }
  if (!m.firstData) { m.firstData = true; refreshSources(); }
  render();
}
hub.addEventListener('meter', (e) => {
  const m = e.detail;
  m.addEventListener('data', (ev) => onMeterData(m, ev.detail));
  m.addEventListener('disconnected', () => { if (state.data.power != null && src.power === 'meter') state.data.power = 0; refreshSources(); });
  refreshSources();
});
hub.addEventListener('change', () => { refreshDeviceBar(); renderWelcome?.(); devicesUi?.update(); showDrop(); renderSuggest(); });
// avviso che non blocca: quale dispositivo è caduto; la registrazione continua e l'app ritenta da sola (js/devices.js)
function showDrop() {
  const down = hub.entries.filter((e) => e.wanted !== false && e.state !== 'connected' && e.lostAt);
  $('dropBanner').hidden = !down.length;
  if (!down.length) return;
  const names = down.map((e) => e.name || t('devices.unnamed')).join(', ');
  const lost = down.some((e) => e.state === 'lost');
  $('dropText').textContent = t(lost ? 'connect.lost' : 'connect.drop', { name: names });
  $('dropRetry').hidden = !lost;
}
$('dropRetry').addEventListener('click', () => hub.retryLost());
hub.addEventListener('drop', (e) => { log(`Dropped: ${e.detail.name}`); showDrop(); });
hub.addEventListener('back', (e) => { log(`Back: ${e.detail.name}`); toast(t('connect.back', { name: e.detail.name || t('devices.unnamed') })); showDrop(); });
hub.addEventListener('lost', () => showDrop());
hub.addEventListener('notice', (e) => toast(e.detail));
// un solo suggerimento alla volta: dopo il rullo, i comandi; poi il cardio; scartabile per sempre
const suggestOff = () => { try { return JSON.parse(localStorage.getItem('suggestOff') || '[]'); } catch { return []; } };
let suggestKind = null;
function renderSuggest() {
  const kind = nextSuggestion({
    trainer: trainer.connected, haveClick: click.connected || !!hub.pendingFor('click'), haveHr: hrm.connected || !!hub.pendingFor('hr'),
    dismissed: suggestOff(), riding: liveRide() || state.ride.log.length > 0,
  });
  suggestKind = kind;
  const covered = !!document.querySelector('.sheet:not([hidden])') || !$('connectHelp').hidden;
  $('suggest').hidden = !kind || covered;
  if (kind) { $('suggestText').textContent = t(`connect.suggest.${kind}`); $('suggestAdd').textContent = t(`connect.suggest.${kind}Btn`); }
}
$('suggestAdd').addEventListener('click', () => { const k = suggestKind; if (k) addDevice({ kind: k }); });
$('suggestNever').addEventListener('click', () => {
  try { localStorage.setItem('suggestOff', JSON.stringify([...new Set([...suggestOff(), suggestKind])])); } catch { /* */ }
  renderSuggest();
});
window.addEventListener('langchange', () => { renderSuggest(); showDrop(); });
function setPref(kind, value) {
  prefs[kind] = value;
  try { localStorage.setItem(kind === 'power' ? 'srcPower' : 'srcCadence', value); } catch { /* */ }
  refreshSources();
}

// riga di stato in home: "Rullo ✓ · Click ✓ · Cardio —" con i nomi veri
function refreshDeviceBar() {
  const ent = (role) => hub.entries.find((e) => e.roles.includes(role));
  // un dispositivo già usato che si sta ricollegando (all'avvio o dopo una caduta) mostra "Ricollego…", non "—"
  const waiting = (role) => hub.pendingFor(role)?.state === 'reconnecting' || hub.entries.some((e) => e.roles.includes(role) && e.state === 'reconnecting');
  const none = (role) => (waiting(role) ? t('devices.reconnecting') : t('home.status.none'));
  if (!trainer.connected) setStatus('trainerStatus', none('trainer'));
  if (click.connected) setStatus('clickStatus', click.label, true); else setStatus('clickStatus', none('click'));
  if (hrm.connected) setStatus('hrStatus', ent('hr')?.name || hrm.device?.name || t('home.hr'), true); else setStatus('hrStatus', none('hr'));
  const extra = hub.meters.filter((m) => m.connected);
  $('dvExtra').hidden = !extra.length;
  if (extra.length) setStatus('extraStatus', `+${extra.length}`, true); $('dvExtra').title = extra.map((m) => m.name).join(' · ');
}

// ---------- Modalità e comandi ----------
document.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => { setMode(r.value, true); render(); applyMode(true); }));

function shift(dir) {
  const next = Math.min(GEARS.length - 1, Math.max(0, state.gear + dir));
  if (next === state.gear) return;
  state.gear = next;
  if (navigator.vibrate) navigator.vibrate(15);
  render();
  applyMode(true);
}

function step(dir) {
  if (workout && !workout.w.test) { // durante un allenamento + / − regolano l'intensità
    workout.bias = Math.min(1.5, Math.max(0.5, +(workout.bias + dir * 0.05).toFixed(2)));
    try { localStorage.setItem('wkBias', workout.bias); } catch { /* */ } // ricordata per i prossimi allenamenti
    toast(t('workout.intensity', { pct: Math.round(workout.bias * 100) })); tickWorkout(0); return;
  }
  if (state.mode === 'gears') return shift(dir);
  if (state.mode === 'erg') { state.erg = Math.min(MAX_W, Math.max(0, state.erg + dir * 5)); rememberErg(); }
  if (state.mode === 'sim') state.grade = Math.min(15, Math.max(-10, +(state.grade + dir * 0.5).toFixed(1)));
  if (state.mode === 'resistance') state.resistance = Math.min(100, Math.max(0, state.resistance + dir * 5));
  syncInputs();
  render();
  applyMode(true);
}

$('up').addEventListener('click', () => step(+1));
$('down').addEventListener('click', () => step(-1));

// Tastiera / telecomandi Bluetooth che inviano frecce o pagina su/giù
const keyDir = (k) => (['ArrowRight', 'ArrowUp', 'PageUp', '+', '=', ' ', 'd', 'D'].includes(k) ? 1 : ['ArrowLeft', 'ArrowDown', 'PageDown', '-', 'a', 'A'].includes(k) ? -1 : 0);
// tastiera = stessi ruoli del controller: frecce, Invio = ok, Esc = back, + / − = plus / minus
const keyRole = (k) => ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', '+': 'plus', '=': 'plus', '-': 'minus', PageUp: 'plus', PageDown: 'minus' })[k] || null;
window.addEventListener('keyup', (e) => { const r = keyRole(e.key); if (clickNav.active && r) { clickNav.key(r, false); return; } if (activeGame?.active && keyDir(e.key)) activeGame.hold?.(0); });
window.addEventListener('keydown', (e) => {
  if (clickCheck.isOpen()) { if (e.key === 'Escape') clickCheck.close(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { if (e.key === 'Escape') e.target.blur(); return; }
  clickNav.sync();
  const role = keyRole(e.key);
  if (clickNav.active && role) { e.preventDefault(); if (!e.repeat) clickNav.key(role, true); return; }
  if (e.key === 'Escape' && playingNow() && !activeGame?.active) { e.preventDefault(); clickNav.back(); return; }
  if (activeGame?.active) {
    const d = keyDir(e.key);
    if (d) { e.preventDefault(); if (!e.repeat) { activeGame.input(d); activeGame.hold?.(d); } }
    if (e.key === 'Escape') closeGame();
    return;
  }
  if (['ArrowUp', 'ArrowRight', 'PageUp', '+', '='].includes(e.key)) { e.preventDefault(); step(+1); }
  if (['ArrowDown', 'ArrowLeft', 'PageDown', '-'].includes(e.key)) { e.preventDefault(); step(-1); }
  // scorciatoie da PC (solo se nessun pannello è aperto e non si sta scrivendo)
  if (e.target.tagName === 'TEXTAREA' || document.querySelector('.sheet:not([hidden])') || !$('gamePanel').hidden) return;
  if (e.key === ' ' && !e.repeat) { e.preventDefault(); $('startStop').click(); }
  if ((e.key === 'g' || e.key === 'G') && !e.repeat) openGame();
});

$('grade').addEventListener('input', (e) => { state.grade = +e.target.value; render(); applyMode(true); });
$('erg').addEventListener('input', (e) => { state.erg = +e.target.value; rememberErg(); render(); applyMode(true); });
$('resistance').addEventListener('input', (e) => { state.resistance = +e.target.value; render(); applyMode(true); });
$('ftp').addEventListener('change', (e) => {
  state.ftp = Math.min(500, Math.max(80, +e.target.value || 200));
  e.target.value = state.ftp;
  localStorage.setItem('ftp', state.ftp);
  if (!ergTouched) { state.erg = ergDefault(); syncInputs(); applyMode(true); }
  render();
});
$('mass').addEventListener('change', (e) => {
  state.mass = Math.min(200, Math.max(30, +e.target.value || 80));
  e.target.value = state.mass;
  localStorage.setItem('mass', state.mass);
});

function syncInputs() {
  $('grade').value = state.grade;
  $('erg').value = state.erg;
  $('resistance').value = state.resistance;
  $('mass').value = state.mass;
  $('ftp').value = state.ftp;
}

// Calcola il target per la modalità corrente
// Cadenza (rpm) usata dal cambio virtuale.
// Il D100 non trasmette la cadenza nei dati FTMS. Con lo Zwift Cog la trasmissione reale
// è fissa, quindi la velocità del volano è proporzionale alla pedalata: la stimiamo.
// 7.37 rpm per km/h viene dai dati del D100 (campo extra ≈ cadenza×10 = velocità×7.37).
// Il fattore dipende dalla corona usata: si calibra in Impostazioni → Cambio virtuale (js/calibrate.js).
let RPM_PER_KMH = loadFactor();
function hasRealCadence() { return src.cadence !== 'estimate'; } // sensore, misuratore o rullo mandano la cadenza vera
function currentCadence() {
  if (hasRealCadence()) return state.cadenceSmooth;
  return state.speedSmooth * 3.6 * RPM_PER_KMH;
}

// Velocità virtuale (m/s) nella marcia scelta: cadenza × rapporto × ruota.
function currentVirtualSpeed() {
  const cad = currentCadence();
  return cad < 15 ? 0 : virtualSpeed(cad, GEARS[state.gear]);
}

// Durezza del cambio virtuale (come la "difficoltà" degli altri programmi): scala la potenza richiesta.
let gearFeel = (() => { try { const v = Number(localStorage.getItem('gearFeel')); return v >= 40 && v <= 100 ? v : 100; } catch { return 100; } })();
function gearTarget() {
  const v = currentVirtualSpeed();
  if (v <= 0) return 0;
  return Math.min(MAX_W, powerForSpeed(v, { grade: state.grade, mass: state.mass }) * gearFeel / 100);
}

let sending = false;
let calibrating = false;
let testingTrainer = false; // "Prova il rullo" in corso: l'ERG non rimanda il vecchio valore finché non finisce
async function applyMode(force = false) {
  if (!trainer.connected || !trainer.controllable || sending || calibrating || testingTrainer) return;
  let key; let fn;
  switch (state.mode) {
    case 'gears': {
      const [minW, maxW] = trainer.ranges.power;
      const w = Math.round(Math.min(Math.max(gearTarget(), Math.max(minW, 0)), maxW || MAX_W));
      // evita di intasare il Bluetooth: invia solo variazioni significative
      if (!force && state.lastSent?.mode === 'gears' && Math.abs(state.lastSent.value - w) < 3) return;
      key = { mode: 'gears', value: w }; fn = () => trainer.setTargetPower(w);
      break;
    }
    case 'erg':
      key = { mode: 'erg', value: state.erg }; fn = () => trainer.setTargetPower(state.erg); break;
    case 'sim':
      key = { mode: 'sim', value: state.grade }; fn = () => trainer.setSimulation({ grade: state.grade, mass: state.mass }); break;
    case 'resistance':
      key = { mode: 'resistance', value: state.resistance }; fn = () => trainer.setResistancePercent(state.resistance); break;
    default: return;
  }
  if (!force && state.lastSent?.mode === key.mode && state.lastSent.value === key.value) return;
  const now = performance.now();
  if (!force && now - state.lastSentAt < 900) return;
  sending = true;
  try {
    await fn();
    state.lastSent = key;
    state.lastSentAt = now;
    $('target').textContent = describeTarget(key);
  } catch (err) {
    log(err.message);
  } finally {
    sending = false;
  }
}

function describeTarget(k) {
  if (k.mode === 'gears' || k.mode === 'erg') return `${k.value} W`;
  if (k.mode === 'sim') return `${k.value.toFixed(1)} %`;
  return `${k.value} %`;
}

// ---------- Sessione ----------
// Avviso di sicurezza: una sola frase, una sola volta, prima della prima uscita (ogni avvio passa da qui).
function safetyAcknowledged() { try { return localStorage.getItem('safetyAck') === '1'; } catch { return true; } }
$('safetyOk').addEventListener('click', () => {
  try { localStorage.setItem('safetyAck', '1'); } catch { /* storage non disponibile */ }
  closeSheet('safetySheet'); $('startStop').click();
});
$('startStop').addEventListener('click', () => {
  const r = state.ride;
  if (!r.running && !safetyAcknowledged()) { openSheet('safetySheet'); return; }
  r.running = !r.running;
  if (r.running) { $('reportHint').hidden = true; hub.retryLost(); renderSuggest(); } // niente inviti mentre si pedala; i dispositivi persi si riprovano
  if (r.running) { r.start = performance.now() - r.elapsed * 1000; requestWakeLock(); }
  updateView();
});
$('reset').addEventListener('click', async () => {
  if (!state.ride.saved && !(await ask(t('finish.confirmReset')))) return;
  if (workout) finishWorkout(false); // senza uscita non c'è più un allenamento in corso
  Object.assign(state.ride, { running: false, elapsed: 0, distance: 0, energy: 0, powerSum: 0, samples: 0, log: [], saved: true, stravaUrl: null, historySaved: false });
  renderWelcome();
  stravaMsg('');
  persist();
  closeSheet('finishSheet');
  render();
});

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* non supportato */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.ride.running && (!wakeLock || wakeLock.released)) requestWakeLock();
});

// Ciclo principale: 1 Hz
setInterval(() => {
  const d = state.data;
  state.cadenceSmooth = state.cadenceSmooth * 0.5 + (d.cadence || 0) * 0.5;
  state.speedSmooth = state.speedSmooth * 0.5 + ((d.speed || 0) / 3.6) * 0.5;
  const r = state.ride;
  if (r.running) {
    r.elapsed = (performance.now() - r.start) / 1000;
    const speedMs = state.mode === 'gears' ? currentVirtualSpeed() : (d.speed || 0) / 3.6;
    r.distance += speedMs;
    r.energy += (d.power || 0) / 1000;
    r.powerSum += d.power || 0;
    r.samples += 1;
    r.log.push({
      t: Date.now(), power: Math.round(d.power || 0), cadence: Math.round(hasRealCadence() ? d.cadence || 0 : currentCadence()),
      hr: d.hr || null, speed: +speedMs.toFixed(3), distance: +r.distance.toFixed(1),
    });
    r.saved = false;
    if (route) tickRoute(speedMs, r.log[r.log.length - 1]);
    if (r.log.length % 10 === 0) persist();
    // piccoli picchi: traguardi durante la pedalata
    const m = Math.floor(r.elapsed / 600);
    if (m > (r.lastMilestone || 0)) { r.lastMilestone = m; toast(t('ride.minutes', { n: m * 10 })); if (!workout) coach.say(t('coach.minutes', { n: m * 10 })); }
    const k5 = Math.floor(r.distance / 5000);
    if (k5 > (r.lastKm || 0)) { r.lastKm = k5; toast(t('ride.km', { n: k5 * 5 })); }
  }
  // ERG: alcuni rulli (es. D100) fissano la resistenza per la potenza richiesta alla velocità del momento e non
  // la ricalcolano finché non ricevono un nuovo comando. Come fanno gli altri programmi, ripetiamo il comando
  // ogni ~2 s anche se il valore non cambia, così la resistenza segue la cadenza e i watt restano quelli richiesti.
  if ((state.mode === 'erg' || state.mode === 'gears') && performance.now() - state.lastSentAt > 1800) state.lastSent = null;
  if (state.mode === 'gears' || state.mode === 'erg') applyMode();
  if (workout && r.running) tickWorkout(1);
  if (r.running) autoShiftTick();
  powerBuf.push(d.power || 0); if (powerBuf.length > 3) powerBuf.shift();
  autoPauseCheck();
  render();
}, 1000);

// ---------- Allenamenti strutturati ----------
let ergBeforeWorkout = null; // obiettivo dell'ERG libero, da rimettere quando l'allenamento finisce
let workout = null; let wkLast = null; let wkPower = []; let wkLowCad = 0;
// cambia modalità; con save=true è una scelta dell'utente e si ricorda (le modalità imposte da allenamenti, percorsi e giochi no)
function setMode(m, save = false) {
  document.querySelector(`[name=mode][value=${m}]`).checked = true;
  state.mode = m; document.body.dataset.mode = m; state.lastSent = null;
  if (save) { writeStore('mode', m); if (m !== 'erg') $('moreModes').open = true; }
}
function customWorkouts() { try { return JSON.parse(localStorage.getItem('customWorkouts') || '[]'); } catch { return []; } }
function allWorkouts() { return [...customWorkouts(), ...workouts()]; }
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderWorkoutList() {
  $('wkFtp').textContent = state.ftp;
  $('workoutList').innerHTML = `<div class="row2 wk-top"><button class="cta-sm" id="wkNew">${t('editor.create')}</button><label class="ghost file-btn"><span>${t('workouts.importZwo')}</span><input id="zwoFile" type="file" accept=".zwo,application/xml,text/xml" hidden></label></div>` + allWorkouts().map((w) => `<div class="wk-wrap"><div class="wk-item">
    <span class="row"><b>${escHtml(w.name)}</b><small>${escHtml(w.tag)}${tss(w) ? ` · ${t('workouts.load', { n: tss(w) })}` : ''}</small></span>
    <canvas data-prof="${w.id}"></canvas><small>${escHtml(w.desc)}</small>
    <span class="wk-go"><button class="cta-sm" data-wk="${w.id}">${t('workouts.start')}</button><button class="ghost" data-wk-play="${w.id}">${t('workouts.play')}</button></span></div>
    <span class="wk-tools">${w.test ? '' : `<button class="link" data-edit="${w.id}">${w.custom ? t('ui.edit') : t('workouts.copyEdit')}</button><button class="link" data-fit="${w.id}">Garmin (.FIT)</button><button class="link" data-zwo="${w.id}">.zwo</button>`}${w.custom ? `<button class="link" data-del="${w.id}">${t('ui.delete')}</button>` : ''}</span></div>`).join('');
  const all = allWorkouts();
  requestAnimationFrame(() => document.querySelectorAll('[data-prof]').forEach((c) => drawProfile(c, all.find((w) => w.id === c.dataset.prof), state.ftp)));
  document.querySelectorAll('[data-wk]').forEach((b) => b.addEventListener('click', () => startWorkout(all.find((w) => w.id === b.dataset.wk))));
  // "Gioca": parte l'allenamento (l'ERG segue i suoi watt) e si apre l'elenco dei giochi
  document.querySelectorAll('[data-wk-play]').forEach((b) => b.addEventListener('click', () => startWorkout(all.find((w) => w.id === b.dataset.wkPlay), { game: true })));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await ask(t('workouts.confirmDelete')))) return;
    localStorage.setItem('customWorkouts', JSON.stringify(customWorkouts().filter((w) => w.id !== b.dataset.del))); dataChanged('workouts', b.dataset.del, { deleted: true }); renderWorkoutList();
  }));
  $('wkNew').addEventListener('click', () => openEditor(null));
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(all.find((w) => w.id === b.dataset.edit))));
  const safeName = (w) => w.name.replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '-') || t('workouts.fileName');
  document.querySelectorAll('[data-fit]').forEach((b) => b.addEventListener('click', () => {
    const w = all.find((x) => x.id === b.dataset.fit);
    offerFile(new File([encodeWorkoutFit(w.name, w.steps, state.ftp)], `${safeName(w)}.fit`, { type: 'application/vnd.ant.fit' }), t('workouts.fitHint'));
  }));
  document.querySelectorAll('[data-zwo]').forEach((b) => b.addEventListener('click', () => {
    const w = all.find((x) => x.id === b.dataset.zwo);
    offerFile(new File([encodeZwo(w.name, w.steps, state.ftp, w.desc)], `${safeName(w)}.zwo`, { type: 'application/xml' }), t('workouts.zwoHint'));
  }));
  $('zwoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const w = parseZwo(await f.text(), f.name);
      localStorage.setItem('customWorkouts', JSON.stringify([w, ...customWorkouts()].slice(0, 30))); dataChanged('workouts', w.id);
      toast(t('workouts.imported', { name: w.name })); renderWorkoutList();
    } catch (err) { toast(t('workouts.importFailed', { error: err.message })); }
  });
}
// piani di allenamento (js/plans-ui.js): scheda nel pannello, card in home, promemoria
const plans = initPlans({ allWorkouts, startWorkout: (w, o) => startWorkout(w, o), toast: (m) => toast(m), isNative, ftp: () => state.ftp, refresh: () => renderWelcome() });
$('openWorkouts').addEventListener('click', () => { plans.show('main'); renderWorkoutList(); renderRoutePick(); openSheet('workoutSheet'); });
$('chooseWorkout').addEventListener('click', () => $('openWorkouts').click());
// cruscotto: Giochi (l'uscita o l'allenamento continuano sotto) e modalità
$('rideGames').addEventListener('click', () => openGame());
$('rideMode').addEventListener('click', () => { document.querySelectorAll('#modeList [data-pick]').forEach((b) => b.classList.toggle('on', b.dataset.pick === state.mode)); openSheet('modeSheet'); });
document.querySelectorAll('#modeList [data-pick]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.pick, true); closeSheet('modeSheet'); syncInputs(); render(); applyMode(true); }));

// ---------- Percorsi GPX ----------
let route = null; let routeDist = 0; let routeT = 0; let routeTrace = []; let routeGhost = null;
const ghostKey = (rt) => `ghost:${rt.name}:${Math.round(rt.total)}`;
function ghostTimeAt(dist) { // secondi impiegati dal record per arrivare a quella distanza
  const g = routeGhost; if (!g) return null;
  const i = g.findIndex((d) => d >= dist); if (i < 0) return null; if (i === 0) return 0;
  return (i - 1 + (dist - g[i - 1]) / Math.max(0.1, g[i] - g[i - 1])) * 5;
} let routeRealism = Number(localStorage.getItem('routeRealism')) || 0.5;
function renderRoutePick() {
  $('routeSamples').innerHTML = ROUTES.map((r) => `<button class="wk-item" data-route="${r.id}"><span class="row"><b>${escHtml(r.name)}</b><small>${t('routes.sample')}</small></span><small>${escHtml(r.desc)}</small></button>`).join('');
  document.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => startRoute(ROUTES.find((r) => r.id === b.dataset.route).make())));
  document.querySelectorAll('#routeReal button').forEach((b) => b.classList.toggle('on', +b.dataset.r === routeRealism));
}
document.querySelectorAll('#routeReal button').forEach((b) => b.addEventListener('click', () => {
  routeRealism = +b.dataset.r; localStorage.setItem('routeRealism', routeRealism); renderRoutePick();
}));
$('gpxFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { startRoute(parseGpx(await f.text(), f.name)); } catch (err) { toast(err.message); }
  e.target.value = '';
});
function startRoute(rt) {
  if (workout) finishWorkout(false);
  route = rt; routeDist = 0; routeT = 0; routeTrace = [0];
  try { routeGhost = JSON.parse(localStorage.getItem(ghostKey(rt)) || 'null'); } catch { routeGhost = null; }
  if (state.mode !== 'gears' && state.mode !== 'sim') setMode('gears');
  closeSheet('workoutSheet');
  document.body.classList.add('in-route');
  $('routeCard').hidden = false; $('rtName').textContent = rt.name;
  if (!rt.hasEle) toast(t('route.noElevation'));
  if (!state.ride.running) $('startStop').click();
  tickRoute(0, null);
}
function tickRoute(dm, sample) {
  routeDist += dm;
  if (dm || sample) { routeT += 1; if (routeT % 5 === 0) routeTrace.push(Math.round(routeDist)); }
  const c = routeAt(route, routeDist);
  if (sample) Object.assign(sample, { lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6), ele: +c.ele.toFixed(1) });
  const g = Math.round(c.grade * routeRealism * 2) / 2;
  if (dm) { // annuncia la prossima salita vera (una volta per salita)
    const ahead = routeAt(route, routeDist + 300);
    if (ahead.grade >= 4 && c.grade < 3 && routeDist - (route.lastClimbSaid ?? -1e9) > 800) { route.lastClimbSaid = routeDist; coach.say(t('coach.climbAhead', { grade: Math.round(ahead.grade) })); }
  }
  if (g !== state.grade) { state.grade = g; syncInputs(); applyMode(true); }
  $('rtGrade').textContent = c.grade.toFixed(1);
  $('rtKm').textContent = `${fmtDec(routeDist / 1000, 2)} / ${fmtDec(route.total / 1000, 1)} km`;
  const gt = ghostTimeAt(routeDist);
  const vs = gt != null && routeT > 10 ? routeT - gt : null;
  $('rtInfo').innerHTML = vs != null
    ? t('route.vsRecord', { delta: `<b class="${vs <= 0 ? 'ahead' : 'behind'}">${vs <= 0 ? '−' : '+'}${fmtClock(Math.abs(vs))}</b>`, ele: Math.round(c.ele) })
    : `${t('route.info', { gain: route.gain, ele: Math.round(c.ele) })}${routeRealism < 1 ? ` · ${t('route.realism', { pct: routeRealism * 100 })}` : ''}${routeGhost ? ` · ${t('route.beatRecord')}` : ''}`;
  drawElevation($('rtProfile'), route, routeDist); drawMap($('rtMap'), route, routeDist);
  if (routeDist >= route.total) {
    coach.say(t('coach.routeDone', { name: route.name, time: spokenTime(routeT) }));
    routeTrace.push(Math.round(route.total));
    const prevT = routeGhost ? (routeGhost.length - 1) * 5 : Infinity;
    if (routeT < prevT) { try { localStorage.setItem(ghostKey(route), JSON.stringify(routeTrace)); } catch { /* pieno */ } toast(routeGhost ? t('route.newRecord', { time: fmtClock(routeT), delta: fmtClock(prevT - routeT) }) : t('route.firstTime', { time: fmtClock(routeT) })); }
    else toast(t('route.noRecord', { time: fmtClock(routeT), record: fmtClock(prevT) })); gameAudio.sfx('win'); progress.event('routes', 1, 60); stopRoute(); }
}
let lastRouteName = null;
function stopRoute() { lastRouteName = route?.name || lastRouteName; route = null; $('routeCard').hidden = true; document.body.classList.remove('in-route'); state.grade = 0; syncInputs(); applyMode(true); }
$('rtStop').addEventListener('click', async () => { if (await ask(t('route.confirmStop'))) stopRoute(); });
// Prima del primo allenamento: se l'FTP non è mai stata impostata (l'app userebbe 200 W) la si chiede,
// con una stima semplice da livello e peso, oppure si propone il test a rampa.
function askFtp(w, opts) {
  const box = document.createElement('div'); box.className = 'calib';
  const lv = [['ftpAsk.new', 1.8], ['ftpAsk.mid', 2.5], ['ftpAsk.fit', 3.2], ['ftpAsk.strong', 3.9]];
  box.innerHTML = `<div class="calib-box" role="dialog" aria-modal="true"><h2>${t('ftpAsk.title')}</h2><p>${t('ftpAsk.why')}</p>
    <div class="ftp-levels">${lv.map(([k, wkg]) => `<button class="ghost" data-ftp="${Math.round(state.mass * wkg / 5) * 5}">${t(k)}<small>≈ ${Math.round(state.mass * wkg / 5) * 5} W</small></button>`).join('')}</div>
    <label class="ftp-own"><span>${t('ftpAsk.own')}</span> <span class="unit-input"><input type="number" min="80" max="500" step="5" inputmode="numeric" placeholder="${state.ftp}"><i>W</i></span></label>
    <div class="row2"><button class="ghost" data-test>${t('ftpAsk.test')}</button><button class="cta" data-ok>${t('ftpAsk.ok')}</button></div></div>`;
  document.body.appendChild(box);
  const set = (v) => { state.ftp = Math.min(500, Math.max(80, Math.round(v / 5) * 5)); $('ftp').value = state.ftp; localStorage.setItem('ftp', state.ftp); };
  box.querySelectorAll('[data-ftp]').forEach((b) => b.addEventListener('click', () => { set(+b.dataset.ftp); box.remove(); startWorkout(w, opts); }));
  box.querySelector('[data-ok]').addEventListener('click', () => { const v = +box.querySelector('input').value; if (v >= 80) set(v); else set(state.ftp); box.remove(); startWorkout(w, opts); });
  box.querySelector('[data-test]').addEventListener('click', () => { set(state.ftp); box.remove(); startWorkout(workouts().find((x) => x.test) || w); }); // il test non si gioca: niente apertura dei giochi
}
// opts.game: dopo l'avvio si apre l'elenco dei giochi; l'allenamento prosegue sotto e comanda il rullo
async function startWorkout(w, opts = {}) {
  if (!w.test && !localStorage.getItem('ftp')) { closeSheet('workoutSheet'); askFtp(w, opts); return false; }
  if (route) stopRoute();
  if (workout && !(await ask(t('workout.confirmInterrupt', { name: workout.w.name })))) return false;
  if (!workout) ergBeforeWorkout = state.erg;
  workout = new WorkoutRunner(w, state.ftp); wkLast = null;
  if (!w.test) workout.bias = Math.min(1.5, Math.max(0.5, Number(localStorage.getItem('wkBias')) || 1)); wkPower = []; wkLowCad = 0;
  setMode('erg');
  closeSheet('workoutSheet');
  document.body.classList.add('in-workout');
  $('workoutCard').hidden = false; $('wkName').textContent = w.name; $('wkTotal').textContent = fmtClock(duration(w));
  if (!state.ride.running) $('startStop').click();
  if (!trainer.connected) toast(t('workout.connectHint'));
  tickWorkout(0);
  if (opts.game && !w.test) { if (activeGame) closeGame(); openGame(); }
  return true;
}
function tickWorkout(dt) {
  if (!workout) return;
  const st = workout.tick(dt);
  if (!st) return finishWorkout(true);
  if (state.erg !== st.target) { state.erg = Math.min(MAX_W, st.target); syncInputs(); render(); applyMode(true); }
  if (wkLast !== st.i) {
    coach.say(t('coach.step', { label: st.x.label.replace(/(\d+)\/(\d+)/, `$1 ${t('coach.of')} $2`), watts: st.target, time: spokenTime(st.x.d) }));
  }
  if (dt && st.next && Math.round(st.left) === 10 && st.x.d >= 40) coach.say(t('coach.last10', { watts: st.nextW }));
  if (wkLast !== null && wkLast !== st.i) { toast(t('workout.stepToast', { label: st.x.label, watts: st.target })); gameAudio.sfx('go'); if (navigator.vibrate) navigator.vibrate([60, 60, 60]); }
  if (dt && st.next && st.left <= 3.5 && st.left > 0.5) gameAudio.sfx('beep');
  wkLast = st.i;
  $('wkStep').textContent = st.x.label; $('wkTarget').textContent = st.target; $('wkLeft').textContent = fmtClock(st.left);
  updateGameStrip(st);
  $('wkNext').textContent = st.next ? t('workout.next', { label: st.next.label, watts: st.nextW }) : t('workout.lastStep');
  $('wkTotal').textContent = `${fmtClock(workout.t)} / ${fmtClock(workout.total)}`;
  $('wkBias').textContent = workout.w.test ? t('workout.testHint') : workout.bias !== 1 ? t('workout.bias', { pct: Math.round(workout.bias * 100) }) : t('workout.biasHint');
  drawProfile($('wkProfile'), workout.w, state.ftp, workout.t);
  // test a rampa: finisce quando non riesci più a tenere il ritmo
  if (workout.w.test && dt) {
    wkPower.push(state.data.power || 0);
    wkLowCad = st.i > 0 && currentCadence() < 40 ? wkLowCad + dt : 0;
    if (wkLowCad >= 8) finishWorkout(true);
  }
}
async function finishWorkout(completed) {
  const w = workout?.w; if (!w) return;
  workout = null; $('workoutCard').hidden = true; document.body.classList.remove('in-workout'); updateGameStrip(null); updateView();
  if (w.test) {
    let best = 0;
    for (let i = 60; i <= wkPower.length; i++) best = Math.max(best, wkPower.slice(i - 60, i).reduce((a, b) => a + b, 0) / 60);
    if (best > 80) {
      const ftp = Math.round(best * 0.75);
      if (await ask(t('workout.ftpFound', { best: Math.round(best), ftp, old: state.ftp }))) {
        state.ftp = ftp; $('ftp').value = ftp; localStorage.setItem('ftp', ftp); toast(t('workout.ftpUpdated', { ftp }));
      }
      plans.onWorkoutDone(w.id);
    } else toast(t('workout.testTooShort'));
    state.erg = Math.round(state.ftp * 0.5); syncInputs(); applyMode(true);
    return;
  }
  if (ergBeforeWorkout != null) { state.erg = ergBeforeWorkout; ergBeforeWorkout = null; syncInputs(); applyMode(true); }
  if (completed) { coach.say(t('coach.workoutDone', { name: w.name })); toast(t('workout.done', { name: w.name })); gameAudio.sfx('win'); progress.event('workouts', 1, 50); plans.onWorkoutDone(w.id); }
}
$('wkSkip').addEventListener('click', () => { workout?.skip(); tickWorkout(0); });
$('wkStop').addEventListener('click', async () => { if (workout?.w.test) finishWorkout(true); else if (await ask(t('workout.confirmEnd'))) finishWorkout(false); });

// ---------- Render ----------
const ZONES = [
  { id: 'Z1', max: 0.55 }, { id: 'Z2', max: 0.75 }, { id: 'Z3', max: 0.9 },
  { id: 'Z4', max: 1.05 }, { id: 'Z5', max: 1.2 }, { id: 'Z6', max: 1.5 },
  { id: 'Z7', max: Infinity },
];
const cassetteEls = GEARS.map((_, i) => {
  const el = document.createElement('i');
  el.style.height = `${10 + (GEARS.length - 1 - i) * 0.85}px`; // marce agili = pignoni grandi
  $('cassette').append(el);
  return el;
});

// ---------- Pannelli ----------
function openSheet(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeSheet(id) { $(id).hidden = true; document.body.style.overflow = ''; }
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(b.dataset.close)));
document.querySelectorAll('.sheet').forEach((sh) => sh.addEventListener('click', (e) => { if (e.target === sh) closeSheet(sh.id); }));
$('openSettings').addEventListener('click', () => openSheet('settingsSheet'));
$('openDebug').addEventListener('click', () => closeSheet('settingsSheet'));
// Due stati della stessa pagina: "home" (non si pedala) e "riding" (cruscotto). Lo sceglie la classe sul <body>;
// Pausa/Riprendi e il quadrante col suo − / + cambiano posto, così restano gli stessi elementi (e gli stessi id) in entrambi.
const isRiding = () => state.ride.running || state.ride.log.length > 0;
let viewRiding = null;
const MODE_NAME = () => ({ erg: 'ERG', gears: t('mode.gears'), sim: t('mode.sim'), resistance: t('mode.resistance') });
function updateView() {
  const r = state.ride; const riding = isRiding();
  document.body.classList.toggle('riding', riding);
  if (riding !== viewRiding) {
    viewRiding = riding;
    (riding ? $('rideStartSlot') : $('startSlot')).append($('startStop'));
    (riding ? $('targetSlot') : $('dialSlot')).append($('dial'));
    if (riding) $('moreModes').open = false;
    renderWelcome?.();
  }
  // Pausa/Riprendi: durante l'uscita è il tasto principale; in home "Avvia"
  $('startStop').textContent = r.running ? t('home.pause') : riding ? t('ride.resume') : t('home.start');
  $('startStop').classList.toggle('running', r.running);
  document.body.classList.toggle('paused', riding && !r.running);
  $('rideModeLabel').textContent = MODE_NAME()[state.mode];
  document.body.classList.toggle('has-workout', !!workout);
  $('freeTitle').textContent = state.mode === 'erg' ? t('today.freeErg') : t('today.freeMode', { mode: MODE_NAME()[state.mode] });
}
function render() {
  const d = state.data; const r = state.ride;
  $('power').textContent = Math.round($('smooth3').checked && powerBuf.length ? powerBuf.reduce((a, b) => a + b, 0) / powerBuf.length : d.power || 0);
  $('cadence').textContent = hasRealCadence() ? Math.round(d.cadence || 0) : trainer.connected ? `~${Math.round(currentCadence())}` : '0';
  const speed = state.mode === 'gears' ? currentVirtualSpeed() * 3.6 : d.speed || 0;
  $('speed').textContent = fmtDec(speed, 1);
  $('hr').textContent = d.hr ? d.hr : '--';
  const hz = d.hr ? hrZone(d.hr) : null;
  $('hrZone').textContent = hz ? `Z${hz.z} ${hz.name}` : ''; $('hrZone').style.color = hz?.color || '';
  $('time').textContent = fmtTime(r.elapsed);
  $('distance').textContent = fmtDec(r.distance / 1000, 2);
  $('avgPower').textContent = r.samples ? Math.round(r.powerSum / r.samples) : 0;
  $('kj').textContent = Math.round(r.energy);
  updateView();
  $('saveFit').disabled = !r.log.length;
  $('shareFit').disabled = !r.log.length;
  $('garminUp').disabled = !r.log.length;
  $('openFit').disabled = !r.log.length;
  $('finishRide').disabled = !r.log.length;
  $('uploadStrava').disabled = !r.log.length || stravaBusy;

  $('gearNum').textContent = state.gear + 1;
  $('gearRatio').textContent = fmtDec(GEARS[state.gear], 2);
  // cassetta: il pignone acceso è la marcia attuale
  cassetteEls.forEach((el, i) => { el.className = i === state.gear ? 'on' : i < state.gear ? 'past' : ''; });
  // zone di potenza sulla FTP
  const pct = (d.power || 0) / state.ftp;
  const z = ZONES.findIndex((zz) => pct < zz.max);
  const zone = ZONES[z < 0 ? ZONES.length - 1 : z];
  $('zone').textContent = d.power ? `${zone.id} ${t(`zone.power.${zone.id}`)}` : '—';
  document.documentElement.style.setProperty('--zone', d.power ? `var(--${zone.id.toLowerCase()})` : 'var(--z1)');
  $('zoneFill').style.left = `${Math.min(100, (pct / 1.7) * 100)}%`;
  $('gradeVal').textContent = `${fmtDec(state.grade, 1)} %`;
  $('ergVal').textContent = `${state.erg} W`;
  $('resVal').textContent = `${state.resistance} %`;
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(state[b.dataset.preset])));

  const big = { gears: state.gear + 1, erg: `${state.erg}`, sim: fmtDec(state.grade, 1), resistance: state.resistance };
  const unit = { gears: t('ctl.gears', { ratio: fmtDec(GEARS[state.gear], 2) }), erg: t('ctl.erg'), sim: t('ctl.sim'), resistance: t('ctl.resistance') };
  $('controlValue').textContent = big[state.mode];
  $('controlUnit').textContent = unit[state.mode];
}

// ---------- Registrazione e file FIT ----------
const STORE = 'ride-freedom-session';
function persist() {
  try {
    const r = state.ride;
    localStorage.setItem(STORE, JSON.stringify({ elapsed: r.elapsed, distance: r.distance, energy: r.energy,
      powerSum: r.powerSum, samples: r.samples, log: r.log, saved: r.saved, stravaUrl: r.stravaUrl || null, historySaved: !!r.historySaved }));
  } catch { /* spazio esaurito o storage non disponibile */ }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved?.log?.length) {
      Object.assign(state.ride, saved, { running: false });
      log(`Previous session restored (${fmtTime(saved.elapsed)}). Press Start to continue or save it as .FIT.`);
    }
  } catch { /* ignora */ }
}
window.addEventListener('pagehide', persist);

function fitFile() {
  const bytes = encodeFit(state.ride.log);
  const d = new Date(state.ride.log[0].t);
  const pad = (n) => String(n).padStart(2, '0');
  const name = `spindro-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.fit`;
  return new File([bytes], name, { type: 'application/vnd.ant.fit' });
}

// salva un file: nell'app va in Download/Spindro, nel browser si scarica
async function saveFile(file) {
  if (GarminBridge) try {
    const res = await GarminBridge.saveDownload({ name: file.name, mime: file.type || 'application/octet-stream', data: await fileB64(file) });
    return res.path;
  } catch (err) { log(`Native save failed (${err.message}), trying a download`); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return `Download/${file.name}`;
}
function openExternal(url) {
  if (GarminBridge) GarminBridge.openUrl({ url }).catch(() => window.open(url, '_blank'));
  else window.open(url, '_blank', 'noopener');
}

$('saveFit').addEventListener('click', async () => {
  try {
    const file = fitFile();
    const where = await saveFile(file);
    state.ride.saved = true; persist();
    log(`Saved ${where}`); toast(t('ride.savedTo', { where }));
  } catch (err) { log(`Save error: ${err.message || err}`); }
});

// Garmin non permette ad altre app di caricare su Connect: salviamo il file e apriamo la pagina "Importa"
const GARMIN_IMPORT = 'https://connect.garmin.com/modern/import-data';
$('garminUp').addEventListener('click', async () => {
  try {
    const file = fitFile();
    const where = await saveFile(file);
    state.ride.saved = true; persist();
    $('stravaMsg').innerHTML = t('finish.garminSaved', { where, file: file.name });
    setTimeout(() => openExternal(GARMIN_IMPORT), 700);
  } catch (err) { log(`Garmin error: ${err.message || err}`); }
});

async function fileB64(file) {
  const buf = new Uint8Array(await file.arrayBuffer()); let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
// nell'app: Condividi e Apri con… del sistema (per provare se Garmin Connect o altre app accettano il file)
async function nativeShare(file, mode) {
  await GarminBridge.shareFile({ name: file.name, mime: mode === 'view' ? 'application/vnd.ant.fit' : 'application/octet-stream', data: await fileB64(file), mode });
  state.ride.saved = true; persist();
}
$('shareFit').addEventListener('click', async () => {
  try {
    const file = fitFile();
    if (GarminBridge) { await nativeShare(file, 'send'); return; }
    await navigator.share({ files: [file], title: t('share.fileTitle') });
    state.ride.saved = true; persist();
  } catch (err) { if (err.name !== 'AbortError') log(`Share error: ${err.message}`); }
});
$('openFit').addEventListener('click', async () => {
  try { await nativeShare(fitFile(), 'view'); } catch (err) { log(`Open with: ${err.message}`); toast(t('finish.noOpenApp')); }
});
try {
  $('shareFit').hidden = !GarminBridge && !navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'x.fit', { type: 'application/vnd.ant.fit' })] });
} catch { /* non supportato */ }
$('openFit').hidden = !GarminBridge;

// ---------- preset (scelta al posto dei cursori) ----------
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  state[b.dataset.preset] = Number(b.dataset.v);
  if (b.dataset.preset === 'erg') rememberErg();
  if (navigator.vibrate) navigator.vibrate(10);
  syncInputs(); render(); applyMode(true);
}));

// ---------- traguardi ----------
let toastTimer = null;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- storico, benvenuto, bentornato ----------
function history() { try { return JSON.parse(localStorage.getItem('rideHistory') || '[]'); } catch { return []; } }
function saveHistory(h) {
  // se lo spazio finisce, si tengono le serie solo delle uscite più recenti
  for (let keep = h.length; keep >= 0; keep -= 20) {
    try { localStorage.setItem('rideHistory', JSON.stringify(h.map((x, i) => (i < h.length - keep ? { ...x, series: undefined } : x)))); return; } catch { /* pieno */ }
  }
}
function openHistory() {
  renderHistory($('historyBody'), history(), state.ftp);
  $('hsUseFtp')?.addEventListener('click', (e) => { state.ftp = +e.target.dataset.ftp; $('ftp').value = state.ftp; localStorage.setItem('ftp', state.ftp); toast(t('history.ftpSet', { ftp: state.ftp })); openHistory(); });
  for (const id of ['settingsSheet', 'finishSheet']) closeSheet(id);
  openSheet('historySheet');
}
// card delle sfide del mese: solo dallo storico locale, anche senza account
function renderChallenges(hist, riding) {
  const el = $('challengeCard');
  if (riding || !hist.length) { el.hidden = true; return; }
  const list = challenges.progress(hist, challenges.monthKey(), state.ftp);
  const month = fmtDate(new Date(), { month: 'long' });
  const medals = Object.keys(challenges.loadDone()).length;
  el.hidden = false;
  el.innerHTML = `<h2>${t('challenges.title', { month })}</h2><ul class="ch-list">${list.map((c) => {
    const left = c.metric === 'z2' ? t('challenges.valueMin', { done: Math.round(c.value), target: c.target }) : t('challenges.value', { done: fmtNum(Math.round(c.value)), target: c.target });
    return `<li class="${c.done ? 'done' : ''}" data-ch="${c.id}"><span class="ch-name">${c.done ? '🏅 ' : ''}${t(`challenges.${c.metric}`, { n: c.metric === 'z2' ? c.target / 60 : c.target })}</span><small>${c.done ? t('challenges.completed') : left}</small><span class="goal-bar" role="progressbar" aria-valuenow="${c.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${c.pct}%"></i></span></li>`;
  }).join('')}</ul>${medals ? `<p class="fine">${t('challenges.medals', { count: medals })}</p>` : ''}`;
}
// il pulsante grande: "Collega il rullo", oppure — se ci sono dispositivi già usati — "Ricollego…" / "Ricollega X"
function connectLabel() {
  if (hub.needsTap.length) return t('devices.reconnectNext', { name: hub.needsTap[0].name || t('devices.unnamed') });
  if (hub.pending.some((k) => k.state === 'reconnecting')) return t('devices.reconnecting');
  return t('welcome.connect');
}
const otherBtn = () => (hub.needsTap.length ? `<button class="ghost" id="welcomeOther">${t('devices.addAnother')}</button>` : '');
function renderWelcome() {
  const el = $('welcome');
  const hist = history();
  const riding = isRiding();
  const plan = plans.renderHome(riding); // la scheda "Oggi" mostra il piano; true se oggi c'è un allenamento
  $('today').classList.toggle('plan-due', !!plan);
  document.body.classList.toggle('no-trainer', !riding && !trainer.connected); // senza rullo l'unico tasto lime è "Collega il rullo"
  renderChallenges(hist, riding || trainer.connected);
  if (riding || trainer.connected) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('compact', !!hist.length);
  if (!hist.length) {
    el.innerHTML = `<h2>${t('welcome.title')}</h2>
      <p>${t('welcome.subtitle')}</p>
      <ol><li>${t('welcome.step1')}</li><li>${t('welcome.step2')}</li><li>${t('welcome.step3')}</li></ol>
      <p class="fine">${t(isNative ? 'connect.pickApp' : 'connect.pick')}</p>
      <button class="cta" id="welcomeConnect">${connectLabel()}</button>${otherBtn()}`;
  } else {
    // utente che torna: solo il tasto per collegare il rullo (e l'obiettivo della settimana, se c'è)
    el.innerHTML = `<button class="cta" id="welcomeConnect">${connectLabel()}</button>${otherBtn()}${goalHtml(hist)}`;
  }
  const wc = $('welcomeConnect');
  wc.disabled = hub.pending.some((k) => k.state === 'reconnecting') && !hub.needsTap.length;
  wc.addEventListener('click', () => primaryConnect()); // apre direttamente la scelta Bluetooth (o ricollega i dispositivi già usati)
  $('welcomeOther')?.addEventListener('click', () => addDevice());
}
trainer.addEventListener('connected', () => renderWelcome());
trainer.addEventListener('disconnected', () => renderWelcome());

setupDebug({ trainer, click, hrm, extra: [{ dbg: pmDbg }, garminDbg], appLog: () => $('log').textContent });
const showVersion = () => { $('appVersion').textContent = t('about.version', { platform: isNative ? t('about.android') : 'Web', build: BUILD }) + (CHANNEL === 'beta' ? ' · BETA' : ''); }; // "BETA" è un'etichetta, non si traduce
if (CHANNEL === 'beta') $('betaBadge').hidden = false;
showVersion();

// ---------- Modalità sviluppatore (7 tocchi sul numero di versione) ----------
const DEV_TAPS = 7;
const devOn = () => localStorage.getItem('devMode') === '1';
function applyDevMode() { document.body.classList.toggle('dev', devOn()); $('devModeOff').checked = devOn(); }
let devTaps = 0; let devTapTimer = null;
function tapVersion() {
  if (devOn()) { toast(t('dev.alreadyOn')); return; }
  devTaps++; clearTimeout(devTapTimer); devTapTimer = setTimeout(() => { devTaps = 0; }, 3000);
  if (devTaps >= DEV_TAPS) {
    devTaps = 0; localStorage.setItem('devMode', '1'); applyDevMode(); toast(t('dev.on'));
  } else if (devTaps >= 3) toast(t('dev.tapsLeft', { count: DEV_TAPS - devTaps }));
}
$('appVersion').addEventListener('click', tapVersion);
$('appVersion').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapVersion(); } });
$('devModeOff').addEventListener('change', (e) => {
  if (e.target.checked) return;
  localStorage.removeItem('devMode'); applyDevMode(); closeDebugPanel(); toast(t('dev.off'));
});
function closeDebugPanel() { if (!$('debugPanel').hidden) $('closeDebug').click(); }
applyDevMode();

// ---------- Segnala un problema (issue GitHub precompilata, senza dati personali) ----------
$('reportIssue').addEventListener('click', () => {
  const dev = [trainer, click, hrm].filter((x) => x?.connected).map((x) => x.device?.name).filter(Boolean).join(', ') || 'none';
  const body = [
    '**What happened?**', '', '', '**What did you expect?**', '', '', '---',
    `App version: ${BUILD}`, `Platform: ${isNative ? 'Android app' : 'Web'}`, `Browser: ${navigator.userAgent}`, `Connected device: ${dev}`, `Language: ${getLang()}`,
  ].join('\n');
  const url = `https://github.com/C1aud1o/Spindro/issues/new?title=${encodeURIComponent('Report from Spindro')}&body=${encodeURIComponent(body)}`;
  openExternal(url);
});

// ---------- Monitoraggio e consenso (D1) ----------
initMonitoring({ release: BUILD, environment: isNative ? 'android' : 'web', lang: getLang() });
// pagine legali del sito (in italiano sotto /it/) e licenze open source dalle Impostazioni
function legalHref(slug) { return `${SITE_URL}${getLang() === 'it' ? '/it' : ''}/${slug}/`; }
function setLegalLinks() { document.querySelectorAll('a[data-legal]').forEach((el) => { el.href = legalHref(el.dataset.legal); }); }
setLegalLinks(); window.addEventListener('langchange', setLegalLinks);
$('analyticsOn').checked = consentGiven();
$('analyticsOn').addEventListener('change', (e) => { setConsent(e.target.checked); if (e.target.checked) { track('app-open'); track('lang', getLang()); } });
function answerConsent(yes) {
  setConsent(yes); $('analyticsOn').checked = yes; closeSheet('consentSheet');
  if (yes) { track('app-open'); track('lang', getLang()); }
}
$('consentYes').addEventListener('click', () => answerConsent(true));
$('consentNo').addEventListener('click', () => answerConsent(false));
// se statistiche o segnalazione errori non sono configurate (fork, build di prova) non si chiede né si mostra nulla
// la frase sugli errori compare solo se la segnalazione errori è davvero accesa (Sentry spento nel repository)
document.querySelector('#consentSheet [data-i18n="privacy.errors"]').hidden = !SENTRY_DSN;
$('analyticsRow').hidden = !GOATCOUNTER_URL; $('errorsNote').hidden = !SENTRY_DSN; $('privacyGroup').hidden = !GOATCOUNTER_URL && !SENTRY_DSN;
if (GOATCOUNTER_URL && !consentAsked()) openSheet('consentSheet');

// ---------- Segnala il tuo rullo (issue GitHub precompilata, senza dati personali) ----------
function trainerReportUrl() {
  return buildReportUrl({ ...(lastTrainer && trainer.connected ? lastTrainer : {}), native: isNative, android: /Android/i.test(navigator.userAgent), version: BUILD, lang: getLang() });
}
$('reportTrainer').addEventListener('click', () => openExternal(trainerReportUrl()));
function offerTrainerReport(name) { // la prima volta che si collega un rullo con questo nome
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('seenTrainers') || '[]'); } catch { /* vuoto */ }
  if (!name || seen.includes(name)) return;
  try { localStorage.setItem('seenTrainers', JSON.stringify([...seen, name].slice(-20))); } catch { /* storage non disponibile */ }
  $('reportHintText').textContent = t('trainerReport.first', { name });
  $('reportHint').hidden = false;
}
// pulsanti dentro il riquadro d'aiuto (home e pannello): "Riprova" e "Segnala"
function problemAction(act) {
  if (act === 'retry') { $('connectHelp').hidden = true; addDevice({ skipCheck: true }); }
  if (act === 'report') openExternal(lastProblem?.code === 'unsupportedDevice' ? deviceReportUrl(lastProblem) : trainerReportUrl());
}
$('connectHelp').addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (a) problemAction(a.dataset.act); });
// "Segnala questo dispositivo": issue GitHub precompilata con nome Bluetooth e servizi (nessun dato personale)
function deviceReportUrl(p) {
  return buildReportUrl({ name: p.name, services: p.services, protocol: 'not supported', kind: 'device', native: isNative, android: /Android/i.test(navigator.userAgent), version: BUILD, lang: getLang() });
}
$('reportHintGo').addEventListener('click', () => { $('reportHint').hidden = true; openExternal(trainerReportUrl()); });
$('reportHintLater').addEventListener('click', () => { $('reportHint').hidden = true; });
trainer.addEventListener('disconnected', () => { $('reportHint').hidden = true; });

// ---------- Guide per marca di orologio (B6) ----------
function renderWatchBrand() {
  const sel = $('watchBrand'); const cur = sel.value || localStorage.getItem('watchBrand') || 'garmin';
  sel.innerHTML = WATCH_BRANDS.map((b) => `<option value="${b}">${t(`watch.brand.${b}`)}</option>`).join('');
  sel.value = WATCH_BRANDS.includes(cur) ? cur : 'garmin';
  $('watchBrandGuide').innerHTML = brandGuide(sel.value);
}
$('watchBrand').addEventListener('change', (e) => { try { localStorage.setItem('watchBrand', e.target.value); } catch { /* */ } $('watchBrandGuide').innerHTML = brandGuide(e.target.value); });
window.addEventListener('langchange', renderWatchBrand);
renderWatchBrand();

// ---------- Pannello Dispositivi ----------
// "Prova il rullo": la resistenza sale e scende per qualche secondo; alla fine si rimette la modalità e il valore di prima
async function testTrainer(onStep) {
  if (testingTrainer || liveRide() || !trainer.connected || !trainer.controllable) return 'unavailable';
  testingTrainer = true;
  return runTrainerTest({
    trainer, ftp: state.ftp, onStep, shouldAbort: () => liveRide() || !trainer.connected,
    restore: async () => { testingTrainer = false; state.lastSent = null; await applyMode(true); },
  });
}
const devicesUi = initDevicesUi({ hub, trainer, hrm, click, src, prefs, setPref, addDevice, reconnect, openSheet, closeSheet, t, openClickCheck: () => clickCheck.open(), testTrainer, isRiding: liveRide, onProblemAction: problemAction });
$('deviceBar').addEventListener('click', () => devicesUi.open());
// all'avvio riprova, in silenzio, i dispositivi già usati (browser: navigator.bluetooth.getDevices(); app Android: plugin)
setTimeout(() => { if ('bluetooth' in navigator) hub.reconnectKnown().catch(() => {}); }, 800);

// ---------- Scelte rapide in home (allenamenti, giochi, storico): spariscono mentre pedali ----------
document.querySelectorAll('#quickPick [data-open]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.open === 'history') openHistory(); else $(b.dataset.open).click();
}));
setInterval(() => { $('quickPick').hidden = state.ride.running || !!workout || !!route; renderSuggest(); }, 1000);

// ---------- Cambio virtuale: calibrazione della cadenza e durezza ----------
function renderGearSettings() {
  $('calibGroup').hidden = hasRealCadence() && !devOn(); // con una cadenza vera la stima e la calibrazione non servono (resta solo per chi sviluppa)
  $('cadFactorInfo').textContent = t('calib.current', { f: RPM_PER_KMH.toFixed(2) }) + (RPM_PER_KMH === DEFAULT_FACTOR ? ` · ${t('calib.notYet')}` : '');
  document.querySelectorAll('#gearFeelChips button').forEach((b) => b.classList.toggle('on', +b.dataset.f === gearFeel));
}
document.querySelectorAll('#gearFeelChips button').forEach((b) => b.addEventListener('click', () => {
  gearFeel = +b.dataset.f; try { localStorage.setItem('gearFeel', gearFeel); } catch { /* */ }
  renderGearSettings(); state.lastSent = null; applyMode(true);
}));
$('calibrateCad').addEventListener('click', () => {
  if (!trainer.connected) { toast(t('calib.needTrainer')); return; }
  runCalibration({
    speedKmh: () => state.speedSmooth * 3.6,
    realCadence: () => (hasRealCadence() ? state.cadenceSmooth : null),
    // durante la misura il rullo tiene una resistenza leggera e costante
    hold: (on) => {
      calibrating = on;
      if (on && trainer.controllable) trainer.setTargetPower(90).catch(() => {});
      if (!on) { state.lastSent = null; applyMode(true); }
    },
    onDone: (f) => { RPM_PER_KMH = f; renderGearSettings(); },
  });
});
$('cadFactorReset').addEventListener('click', () => {
  try { localStorage.removeItem('cadFactor'); } catch { /* */ }
  RPM_PER_KMH = DEFAULT_FACTOR; renderGearSettings();
});
renderGearSettings();
window.addEventListener('langchange', renderGearSettings);

// ---------- Ponte verso Garmin (solo app Android) ----------
$('garminNative').hidden = !isNative;
$('garminWeb').hidden = isNative;
let garminTimer = null; let garminHintTimer = null; let lastGarminStatus = null; let conflictTimer = null;
// Un Garmin collegato al telefono (Garmin Connect) ma che non usa il sensore: quasi sempre è il
// motivo per cui resta su "Connecting". Lo segnaliamo con la guida illustrata.
async function checkGarminConflict() {
  if (!GarminBridge || !$('garminOn').checked) { $('garminBanner').hidden = true; $('garminConflict').hidden = true; return; }
  let names = [];
  try { names = (await GarminBridge.connectedDevices()).devices || []; } catch { /* plugin vecchio */ }
  if (lastGarminStatus?.devices) names.push(...lastGarminStatus.devices.split(', '));
  const users = (lastGarminStatus?.users || '').toLowerCase();
  const linked = [...new Set(names)].filter((n) => GARMIN_RE.test(n) && !users.includes(n.toLowerCase()));
  const show = linked.length > 0 && !(lastGarminStatus?.usersCount > 0);
  if (show) {
    const name = linked[0];
    const html = watchGuide(name);
    $('garminConflict').innerHTML = `${t('garmin.linked', { name })}${html}`;
    $('garminBanner').innerHTML = `<h2>${t('garmin.unlinkTitle', { name })}</h2><p>${t('garmin.unlinkBody')}</p>${html}`;
  }
  $('garminConflict').hidden = !show;
  $('garminBanner').hidden = !show;
}
function pushGarmin() {
  const d = state.data;
  const speed = state.mode === 'gears' ? currentVirtualSpeed() * 3.6 : d.speed || 0;
  const pedaling = (d.power || 0) > 0 || speed > 1;
  GarminBridge.update({ power: Math.round(d.power || 0), cadence: pedaling ? Math.round(currentCadence()) : 0, speedKmh: +speed.toFixed(2) }).catch(() => {});
}
async function setGarmin(on) {
  localStorage.setItem('garminOn', on ? '1' : '0');
  if (!GarminBridge) return;
  clearInterval(garminTimer);
  if (on) {
    try {
      await GarminBridge.start({ name: 'Spindro' });
      setStatus('garminStatus', t('garmin.waiting'));
      garminTimer = setInterval(pushGarmin, 500);
      garminDbg.dbg.setStatus('Waiting');
      clearInterval(conflictTimer); conflictTimer = setInterval(checkGarminConflict, 5000); setTimeout(checkGarminConflict, 1500);
      // se dopo un minuto nessuno usa il sensore, suggerisci la causa più probabile
      clearTimeout(garminHintTimer);
      garminHintTimer = setTimeout(() => { $('garminHint').hidden = false; }, 60000);
      log('Garmin bridge on: the phone is visible as the "Spindro" power sensor');
    } catch (err) {
      setStatus('garminStatus', t('garmin.error')); $('garminOn').checked = false; log(`Garmin: ${err.message}`);
    }
  } else {
    await GarminBridge.stop().catch(() => {});
    setStatus('garminStatus', t('status.off'));
    clearInterval(conflictTimer); checkGarminConflict();
  }
}
if (GarminBridge) {
  GarminBridge.addListener('status', (st) => {
    if (!$('garminOn').checked) return;
    // "connesso" non basta: il Garmin di solito è già connesso al telefono per Garmin Connect.
    // Il sensore è in uso solo quando un dispositivo si iscrive ai dati di potenza o velocità/cadenza.
    const inUse = (st.usersCount || 0) > 0;
    garminDbg.dbg.status = inUse ? 'Connected (in use)' : st.advertising ? 'Waiting' : st.running ? 'Starting' : 'Off';
    garminDbg.dbg.setValues({ visible: !!st.advertising, connected: st.connected || 0, devices: st.devices || '-', inUse: st.users || '-' });
    if (inUse) { clearTimeout(garminHintTimer); $('garminHint').hidden = true; }
    lastGarminStatus = st; checkGarminConflict();
    setStatus('garminStatus', inUse ? t('garmin.inUse', { users: st.users }) : st.advertising ? t('garmin.waiting') : st.running ? t('garmin.starting') : t('status.off'), inUse);
  });
  GarminBridge.addListener('error', (ev) => log(`Garmin: ${ev.message}`));
  GarminBridge.addListener('log', (ev) => { log(`Garmin · ${ev.message}`); garminDbg.dbg.log(ev.message); });
  $('garminOn').addEventListener('change', (e) => setGarmin(e.target.checked));
  if (localStorage.getItem('garminOn') === '1') { $('garminOn').checked = true; setGarmin(true); }
}

// ---------- Gioco ----------
let gradeBeforeGame = 0; let modeBeforeGame = null;
function workoutForGames() {
  if (!workout) return null;
  const w = workout.w; const k = w.test ? 1 : workout.bias; let t0 = 0;
  const steps = w.steps.map((x, i) => {
    const a = workout.wattsOf(x, 0) * k; const b = workout.wattsOf(x, x.d) * k; const watts = Math.round((a + b) / 2);
    const pct = +(watts / state.ftp).toFixed(3);
    const kind = i === 0 && b > a && pct < 0.7 ? 'warm' : b < a && pct < 0.65 ? 'cool' : pct >= 1.05 ? (x.d <= 60 ? 'sprint' : 'effort') : pct >= 0.85 ? 'effort' : pct >= 0.6 ? 'pace' : 'rest';
    const o = { t0, dur: x.d, pct, watts, kind, w0: Math.round(a), w1: Math.round(b), label: x.label }; t0 += x.d; return o;
  });
  return { name: w.name, total: workout.total, elapsed: Math.round(workout.t), steps };
}
// striscia in cima al gioco: passo dell'allenamento, watt del rullo e tempo che resta nel passo
function updateGameStrip(st) {
  const strip = $('gameStrip'); const on = !!(workout && st && !$('gamePanel').hidden && !gameHooks.workoutHud); // i giochi con workoutHud mostrano da soli il passo nel loro HUD
  strip.hidden = !on; $('gamePanel').classList.toggle('has-strip', on);
  if (!on) return;
  $('gameStrip').title = workout.w.name; $('gsLabel').textContent = st.x.label;
  $('gsTail').textContent = t('workoutStrip.tail', { watts: st.target, left: fmtClock(st.left) });
  $('gsFill').style.width = `${Math.min(100, (workout.t / workout.total) * 100)}%`;
}
const refreshGameStrip = () => { if (workout) updateGameStrip(workout.locate()); else updateGameStrip(null); };
// Classifiche: durata e potenza della partita si misurano qui (1 campione al secondo mentre un gioco è aperto)
let gameRunT0 = 0; let gamePower = []; let gameSampler = null;
function reportGameScore({ game, stage, score }) {
  const dur = Math.round((Date.now() - gameRunT0) / 1000);
  // in demo (rullo non collegato) o senza partita avviata non si invia nulla
  if (!accountsAvailable || !gameRunT0 || dur < 20 || !trainer.connected || !Number.isFinite(score)) { gameRunT0 = 0; return; }
  gameRunT0 = 0;
  const p = gamePower.slice(-Math.max(1, dur));
  const avgW = p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : 0;
  const maxW = p.length ? Math.max(avgW, ...p) : 0;
  submitGameScore({ game, ...(stage !== undefined ? { stage } : {}), score: game === 'racer' ? score : Math.round(score), durationSec: dur, avgW, maxW });
}
const progress = new Progress();
const gameHooks = {
  progress,
  connected: () => trainer.connected,
  ftp: () => state.ftp, // i giochi chiedono sforzi in % della FTP
  speedKmh: () => (state.mode === 'gears' ? currentVirtualSpeed() * 3.6 : state.data.speed || 0),
  stats: () => ({ power: Math.round(state.data.power || 0), cadence: Math.round(currentCadence()), gear: state.mode === 'gears' ? state.gear + 1 : null }),
  shift: (d) => shift(d),
  close: () => closeGame(), // "− = ai giochi" nella schermata dei risultati: torna all'elenco dei giochi
  runStart: () => { gameRunT0 = Date.now(); },
  runEnd: (r) => reportGameScore(r),
  // Allenamento in corso sotto al gioco, oppure null. Serve ai giochi per far seguire alle loro fasi di sforzo i passi dell'allenamento.
  //   name    nome dell'allenamento
  //   total   durata totale (s)
  //   elapsed secondi già fatti
  //   steps   [{ t0, dur, pct, watts, kind }]: inizio (s), durata (s), media in frazione della FTP (0.75 = 75%, con l'intensità scelta),
  //           watt medi, e kind come nei piani dei giochi: warm | pace | effort | sprint | rest | cool; w0/w1 watt a inizio e fine
  //           del passo (rampe), label nome del passo. I giochi usano kit/workout-plan.js per leggerlo.
  // Con un allenamento in corso setGrade viene ignorato: il rullo resta in ERG sui watt dell'allenamento.
  workout: () => workoutForGames(),
  workoutHud: true, // i giochi mostrano il passo dell'allenamento nel proprio HUD: la striscia dell'app sta nascosta
  setGrade: (g) => {
    if (workout) return; // l'ERG dell'allenamento non si tocca
    // stessa regola dei percorsi: la pendenza arriva al rullo scalata dal "realismo salite" (default 50%)
    state.grade = g == null ? gradeBeforeGame : Math.round(Math.max(-10, Math.min(15, g)) * routeRealism * 2) / 2;
    syncInputs(); render(); applyMode(true);
  },
};
const gameAudio = new GameAudio();
// sblocco dell'audio al primo tocco (WebView e browser lo tengono sospeso finché l'utente non interagisce)
const unlockAudio = () => {
  gameAudio.warmUp();
  const c = gameAudio.useElements() ? null : gameAudio.ensure();
  if (c) { const b = c.createBuffer(1, 1, 22050); const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0); }
};
// resta in ascolto finché il contesto non è davvero attivo (Android lo sospende anche quando l'app va in background)
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => { if (gameAudio.ctx?.state !== 'running') unlockAudio(); }, { capture: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && gameAudio.ctx?.state !== 'running') gameAudio.ctx?.resume().catch(() => {}); });
// Test audio: A = Web Audio in tempo reale, B = suoni preparati e riprodotti dal lettore di sistema
async function audioTest(mode) {
  const out = []; const prev = localStorage.getItem('audioMode');
  try {
    localStorage.setItem('audioMode', mode);
    if (gameAudio.muted) out.push('WARNING: game audio was muted (Audio button in games): turning it back on');
    if (gameAudio.muted) gameAudio.toggleMute();
    if (mode === 'web') {
      const c = gameAudio.ensure(); if (!c) throw new Error('Web Audio not available');
      if (c.state !== 'running') await c.resume().catch(() => {});
      out.push(`A · Web Audio: ${c.state}, ${c.sampleRate} Hz`);
      gameAudio.sfx('pickup'); setTimeout(() => gameAudio.jingle('win'), 450);
    } else {
      await gameAudio.playElementSfxPrepare('pickup');
      out.push(gameAudio.sfxUrls?.pickup ? 'B · Player: sound prepared' : 'B · Player: could not prepare the sound');
      gameAudio.sfx('pickup'); setTimeout(() => gameAudio.jingle('win'), 450);
    }
    out.push('Did you hear the notes and then the jingle? If so, pick this method below.');
  } catch (err) { out.push(`error: ${err.message}`); }
  setTimeout(() => { if (prev) localStorage.setItem('audioMode', prev); else localStorage.removeItem('audioMode'); }, 1200);
  $('audioResult').textContent = out.join(' · ');
  log(`Audio test ${mode}: ${out.join(' | ')}`);
}
$('audioTestA').addEventListener('click', () => audioTest('web'));
$('audioTestB').addEventListener('click', () => audioTest('element'));
function renderAudioMode() { const m = localStorage.getItem('audioMode') || 'auto'; document.querySelectorAll('#audioMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); }
document.querySelectorAll('#audioMode button').forEach((b) => b.addEventListener('click', () => {
  localStorage.setItem('audioMode', b.dataset.m); gameAudio.stopSong(); gameAudio.warmed = false; gameAudio.warmUp(); renderAudioMode();
  toast(b.dataset.m === 'auto' ? 'Audio: auto' : b.dataset.m === 'web' ? 'Audio: Web Audio' : 'Audio: system player');
}));
renderAudioMode();
// I giochi (e three.js) si scaricano solo alla prima apertura: l'avvio dell'app resta leggero.
const GAME_DEFS = {
  horde: { load: () => import('./games/horde.js').then((m) => m.Horde), title: 'games.horde.name', help: 'games.horde.help' },
  racer: { load: () => import('./games/racer3d.js').then((m) => m.Racer3D), title: 'games.racer.name', help: 'games.racer.help' },
  shooter: { load: () => import('./games/strike3d.js').then((m) => m.Strike3D), title: 'games.shooter.title', help: 'games.shooter.help' },
  gruppetto: { load: () => import('./games/gruppetto.js').then((m) => m.Gruppetto), title: 'games.gruppetto.name', help: 'games.gruppetto.help' },
  mattoni: { load: () => import('./games/mattoni.js').then((m) => m.Mattoni), title: 'games.mattoni.name', help: 'games.mattoni.help' },
  planata: { load: () => import('./games/planata.js').then((m) => m.Planata), title: 'games.planata.name', help: 'games.planata.help' },
  video: { load: () => import('./videoride.js').then((m) => m.VideoRide), title: 'games.video.title', help: 'games.video.help', noAudio: true },
};
const games = {}; // istanze create alla prima apertura
async function loadGame(kind) {
  if (games[kind]) return games[kind];
  const d = GAME_DEFS[kind];
  const Cls = await d.load();
  games[kind] = { ...d, game: d.noAudio ? new Cls($('gameCanvas'), gameHooks) : new Cls($('gameCanvas'), gameHooks, gameAudio) };
  return games[kind];
}
let activeGame = null; let activeKind = null;

function openGame() {
  renderBoards($('boardPanel'), { stages: [0, 1, 2].map((i) => `games.racer.stage${i + 1}.name`) });
  $('gamePanel').hidden = false;
  $('gameMenu').hidden = false;
  progress.renderMenu($('progressPanel'));
  $('gameTitle').textContent = t('games.title');
  $('gameHelp').textContent = '';
  document.body.classList.add('game-open');
  refreshGameStrip();
}
let gameLoading = false;
async function startGame(kind) {
  if (gameLoading) return;
  gameLoading = true;
  let g;
  try { $('gameMenu').classList.add('loading'); g = await loadGame(kind); } catch { toast(t('games.loadError')); return; } finally { gameLoading = false; $('gameMenu').classList.remove('loading'); }
  if ($('gamePanel').hidden) return; // chiuso mentre si scaricava
  track('game', kind);
  gameAudio.ensure(); // l'audio va sbloccato da un tocco dell'utente
  gradeBeforeGame = state.grade;
  // il gioco controlla la pendenza: serve la modalità Cambio o Pendenza. Con un allenamento in corso no: l'ERG resta sui suoi watt.
  if (!workout && state.mode !== 'gears' && state.mode !== 'sim') {
    modeBeforeGame = state.mode; // a fine gioco si torna a quella
    setMode('gears');
  }
  if (trainer.connected && !state.ride.running) $('startStop').click();
  $('gameMenu').hidden = true;
  activeKind = kind;
  $('gameTitle').textContent = t(g.title);
  $('gameHelp').textContent = t(g.help);
  requestWakeLock();
  if (accountsAvailable && !gameSampler) gameSampler = setInterval(() => { gamePower.push(Math.min(2500, Math.round(state.data.power || 0))); if (gamePower.length > 10800) gamePower.shift(); }, 1000);
  if (kind !== 'video') clickNav.stop(); // nel gioco + e − tornano al gioco
  activeGame = g.game; window.__game = g.game; // accesso per la diagnostica e i test automatici
  activeGame.start();
}
function closeGame() {
  if (activeGame) { // dal gioco si torna al menu, dal menu si esce
    activeGame.stop();
    activeGame = null; activeKind = null;
    if (modeBeforeGame && state.mode === 'gears' && !workout) { setMode(modeBeforeGame); state.grade = gradeBeforeGame; syncInputs(); render(); applyMode(true); }
    modeBeforeGame = null;
    clearInterval(gameSampler); gameSampler = null; gamePower = []; gameRunT0 = 0;
    openGame();
    return;
  }
  $('gamePanel').hidden = true;
  document.body.classList.remove('game-open');
  updateGameStrip(null);
}
document.querySelectorAll('.game-card').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.game)));
$('openGame').addEventListener('click', openGame);
// invito "Accedi per entrare in classifica": chiude i giochi e apre le impostazioni sulla sezione Account
window.addEventListener('account:open', () => {
  if (activeGame) closeGame();
  $('gamePanel').hidden = true; document.body.classList.remove('game-open');
  openSheet('settingsSheet');
  setTimeout(() => document.getElementById('accountGroup')?.scrollIntoView({ block: 'start' }), 150);
});
$('closeGame').addEventListener('click', closeGame);
const showMute = () => { $('muteGame').textContent = gameAudio.muted ? t('games.audioOff') : t('games.audioOn'); };
showMute();
$('muteGame').addEventListener('click', () => { gameAudio.toggleMute(); showMute(); });
$('gameCanvas').addEventListener('pointerdown', (e) => {
  if (!activeGame?.active) return;
  const r = e.currentTarget.getBoundingClientRect();
  const d = e.clientX - r.left < r.width / 2 ? -1 : +1;
  activeGame.input(d); activeGame.hold?.(d);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('gameCanvas').addEventListener(ev, () => activeGame?.active && activeGame.hold?.(0));
// ---------- Strava ----------
const strava = new Strava(STRAVA_PROXY);
let stravaBusy = false;
function stravaMsg(text, html = false) { for (const id of ['stravaMsg', 'stravaNote']) $(id)[html ? 'innerHTML' : 'textContent'] = text; }
function renderStrava() {
  $('stravaSite').textContent = location.origin;
  $('stravaDomain').textContent = location.hostname;
  $('stravaId').value = strava.cfg.clientId || '';
  $('stravaSecret').value = strava.cfg.clientSecret || '';
  $('stravaSetup').hidden = strava.connected || strava.publicMode;
  $('stravaPublic').hidden = strava.connected || !strava.publicMode;
  $('stravaLinked').hidden = !strava.connected;
  $('stravaAuto').checked = !!strava.cfg.auto;
  $('uploadStrava').hidden = !strava.connected;
  setStatus('stravaStatus', strava.connected ? (strava.athlete ? t('strava.linkedAs', { athlete: strava.athlete }) : t('strava.linked')) : t('status.notConnected'), strava.connected);
}
$('stravaConnect').addEventListener('click', () => {
  const id = $('stravaId').value.trim(); const secret = $('stravaSecret').value.trim();
  if (!/^\d+$/.test(id) || secret.length < 20) { stravaMsg(t('strava.badCreds')); return; }
  strava.setCredentials(id, secret);
  persist();
  strava.authorize().catch((err) => stravaMsg(t('ui.error', { error: err.message })));
});
$('stravaPublicConnect').addEventListener('click', async () => {
  persist();
  try { await strava.authorize(); } catch (err) { stravaMsg(t('ui.error', { error: err.message })); }
});
$('stravaDisconnect').addEventListener('click', () => { strava.disconnect(); renderStrava(); stravaMsg(t('strava.disconnected')); });
$('stravaAuto').addEventListener('change', (e) => { strava.cfg.auto = e.target.checked; strava.save(); });

async function uploadToStrava() {
  const r = state.ride;
  if (!r.log.length || stravaBusy) return;
  if (r.stravaUrl) { stravaMsg(t('strava.already', { url: r.stravaUrl }), true); return; }
  stravaBusy = true; render();
  try {
    const avgW = r.samples ? Math.round(r.powerSum / r.samples) : 0;
    const res = await strava.upload(fitFile(), {
      name: t('strava.activityName', { time: fmtTime(r.elapsed), watts: avgW }),
      description: t('strava.activityDesc', { watts: avgW, kj: Math.round(r.energy), km: (r.distance / 1000).toFixed(1) }),
      externalId: `spindro-${r.log[0].t}`,
    }, (m) => stravaMsg(m));
    r.saved = true;
    if (res.url) { r.stravaUrl = res.url; stravaMsg(`${res.message} ${t('strava.openActivity', { url: res.url })}`, true); }
    else stravaMsg(res.message);
    persist();
    log(res.message);
  } catch (err) {
    stravaMsg(t('strava.uploadFailed', { error: err.message }));
    log(`Strava error: ${err.message}`);
  } finally { stravaBusy = false; render(); }
}
$('uploadStrava').addEventListener('click', uploadToStrava);
$('finishRide').addEventListener('click', () => {
  const r = state.ride;
  if (r.running) $('startStop').click(); // pausa
  const avgW = r.samples ? Math.round(r.powerSum / r.samples) : 0;
  $('finishSummary').innerHTML = [[t('home.time'), fmtTime(r.elapsed)], ['km', fmtDec(r.distance / 1000, 2)], [t('home.avgPower'), avgW], ['kJ', Math.round(r.energy)]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  // il "picco" e la "fine": celebrare, confrontare, invitare a tornare
  const hist = history();
  const prev = hist[hist.length - 1];
  // medaglie: record di potenza, uscita più lunga, obiettivo della settimana, costanza
  const medals = [];
  const goalBefore = goalState(hist);
  if (r.elapsed >= 60) {
    const st = rideStats(r.log);
    for (const d of [5, 60, 300, 1200]) {
      const l = t(`finish.dur.${d}`);
      const old = Math.max(0, ...hist.map((h) => h.best?.[d] || 0));
      if (st.best[d] && old && st.best[d] > old) medals.push({ ico: '⚡', title: t('finish.record', { dur: l, w: st.best[d] }), sub: t('finish.recordSub', { delta: st.best[d] - old }) });
    }
    const longest = Math.max(0, ...hist.map((h) => h.dur));
    if (hist.length && r.elapsed > longest + 30) medals.push({ ico: '⏱', title: t('finish.longest'), sub: t('time.minutes', { count: Math.round(r.elapsed / 60) }) });
    const days = new Set([...hist.map((h) => new Date(h.t).toDateString()), new Date().toDateString()]);
    let streak = 0; for (let d = new Date(); days.has(d.toDateString()); d.setDate(d.getDate() - 1)) streak++;
    if (streak >= 2) medals.push({ ico: '🔥', title: t('finish.streak', { n: streak }), sub: t('finish.streakSub') });
    if (!hist.length) medals.push({ ico: '★', title: t('finish.first'), sub: t('finish.firstSub') });
  }
  let chDone = [];
  if (!r.historySaved && r.elapsed >= 60) {
    const entry = { t: Date.now(), dur: Math.round(r.elapsed), km: +(r.distance / 1000).toFixed(2), avgW, kj: Math.round(r.energy), ...rideStats(r.log) };
    const histBefore = [...hist];
    hist.push(entry);
    saveHistory(hist.slice(-200)); r.historySaved = true; persist();
    chDone = challenges.newlyDone(histBefore, hist, challenges.monthKey(), state.ftp);
    challenges.markDone(chDone);
    dataChanged('rides', String(entry.t));
  }
  const week = hist.filter((h) => Date.now() - h.t < 7 * 864e5).length;
  const mins = Math.round(r.elapsed / 60);
  $('finishTitle').textContent = mins >= 60 ? t('finish.titleLong') : mins >= 30 ? t('finish.titleMid') : r.elapsed >= 60 ? t('finish.titleShort') : t('finish.titleTiny');
  $('finishPraise').textContent = r.elapsed >= 60 ? `${t('finish.praise', { mins, kj: Math.round(r.energy) })} ${week > 1 ? t('finish.praiseWeek', { n: week }) : t('finish.praiseStart')}` : '';
  $('finishCompare').textContent = prev && r.elapsed >= 60 && prev.avgW ? (avgW > prev.avgW ? t('finish.compareMore', { delta: avgW - prev.avgW }) : avgW === prev.avgW ? t('finish.compareSame') : '') : '';
  const gl = goalState(hist);
  $('finishNudge').textContent = gl ? (gl.done >= gl.goal ? t('finish.goalDone', { done: gl.done, goal: gl.goal }) : t('finish.goalLeft', { done: gl.done, goal: gl.goal, left: gl.goal - gl.done })) : t('finish.nudge');
  $('stravaMsg').innerHTML = r.stravaUrl
    ? t('strava.alreadyOn', { url: r.stravaUrl })
    : strava.connected ? '' : t('strava.connectHint');
  if (gl && goalBefore && goalBefore.done < gl.goal && gl.done >= gl.goal) medals.unshift({ ico: '🏁', title: t('finish.goalTitle'), sub: t('finish.goalSub', { done: gl.done, goal: gl.goal }) });
  for (const c of chDone) medals.unshift({ ico: '🏅', title: t('challenges.badge', { name: t(`challenges.${c.metric}`, { n: c.metric === 'z2' ? c.target / 60 : c.target }) }), sub: t('challenges.badgeSub') });
  badges($('finishBadges'), medals.slice(0, 4));
  openSheet('finishSheet');
  if (r.elapsed >= 60) track('ride-complete');
  if (r.elapsed >= 60) { party($('finishSheet'), { records: medals.length }); if (medals.length) gameAudio.jingle('win', 0.6); }
  if (strava.connected && strava.cfg.auto && !r.stravaUrl) uploadToStrava();
});
strava.handleRedirect().then((res) => {
  if (res) { stravaMsg(res.message); log(res.message); openSheet('settingsSheet'); }
  renderStrava();
}).catch((err) => { stravaMsg(t('strava.linkError', { error: err.message })); renderStrava(); });
renderStrava();

restore();
setMode(state.mode);
$('moreModes').open = state.mode !== 'erg'; // chi ha scelto un'altra modalità la ritrova aperta
renderWelcome();
syncInputs();
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

$('openHistory').addEventListener('click', openHistory);
$('finishHistory').addEventListener('click', openHistory);

// ---------- Pausa automatica, potenza 3 s, schermo intero ----------
const powerBuf = []; let idleSec = 0; let moveSec = 0; let autoPaused = false;
for (const id of ['autoPause', 'smooth3']) {
  const saved = localStorage.getItem(id); if (saved != null) $(id).checked = saved === '1';
  $(id).addEventListener('change', () => { localStorage.setItem(id, $(id).checked ? '1' : '0'); render(); });
}
function autoPauseCheck() {
  if (!$('autoPause').checked || !trainer.connected) { autoPaused = false; return; }
  const moving = (state.data.power || 0) > 5 || (state.data.speed || 0) > 2;
  const r = state.ride;
  if (r.running && !moving) {
    if (++idleSec >= 5 && !activeGame?.active) { $('startStop').click(); autoPaused = true; toast(t('auto.paused')); }
  } else idleSec = 0;
  if (autoPaused && !r.running && moving) { autoPaused = false; $('startStop').click(); toast(t('auto.resumed')); }
  // partenza automatica: sessione nuova e pedali da 3 secondi
  if (!r.running && !autoPaused && r.elapsed === 0 && moving && !testingTrainer) { if (++moveSec >= 3) { $('startStop').click(); toast(t('auto.started')); } } else moveSec = 0;
  if (r.running) autoPaused = autoPaused && !r.running;
}
$('startStop').addEventListener('click', () => { if (state.ride.running) idleSec = 0; });
$('fullscreen').addEventListener('click', () => {
  closeSheet('settingsSheet');
  if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast(t('settings.fullscreenNA')));
});
if (!document.documentElement.requestFullscreen) $('fullscreen').hidden = true;

$('shareImg').addEventListener('click', async () => {
  const r = state.ride; if (!r.log.length) { toast(t('share.noData')); return; }
  const st = rideStats(r.log); const avgW = r.samples ? Math.round(r.powerSum / r.samples) : 0;
  const mins = Math.round(r.elapsed / 60);
  const stats = [[t('share.avgPower'), avgW, 'W'], [t('home.time'), fmtTime(r.elapsed), ''], [t('share.distance'), fmtDec(r.distance / 1000, 1), 'km'], [t('share.energy'), Math.round(r.energy), 'kJ']];
  if (st.np) stats.push([t('share.normalized'), st.np, 'W']);
  if (st.best[1200]) stats.push([t('share.best20'), st.best[1200], 'W']); else if (st.best[60]) stats.push([t('share.best1'), st.best[60], 'W']);
  const { shareCard } = await import('./sharecard.js');
  const res = await shareCard({
    title: $('finishTitle').textContent || t('share.title', { mins }),
    date: fmtDate(new Date()),
    stats, series: st.series, ftp: state.ftp, route: route?.name || lastRouteName,
  });
  if (res === 'saved') toast(t('share.saved'));
});

// ---------- Zone di frequenza cardiaca (in % del battito massimo) ----------
const HR_ZONES = [[0.6, '#8a8f98'], [0.7, '#4d8dff'], [0.8, '#2fbf71'], [0.9, '#f2c230'], [Infinity, '#ff4d4d']];
function hrMax() { return Number(localStorage.getItem('hrMax')) || Math.max(170, ...history().map((h) => h.maxHr || 0)) || 185; }
function hrZone(hr) { const k = hr / hrMax(); const i = HR_ZONES.findIndex(([m]) => k < m); return { z: i + 1, name: t(`zone.hr.z${i + 1}`), color: HR_ZONES[i][1] }; }
$('hrMax').value = localStorage.getItem('hrMax') || '';
$('hrMax').addEventListener('change', (e) => { const v = Math.round(+e.target.value); if (v >= 120 && v <= 220) localStorage.setItem('hrMax', v); else { localStorage.removeItem('hrMax'); e.target.value = ''; } render(); });

// ---------- Backup: esporta / importa i dati tra dispositivi ----------
const NO_BACKUP = /^(stravaConfig|ride-freedom-session|account:session|sync:.*)$/; // token Strava, uscita in corso, stato dell'account e della sincronizzazione
$('backupOut').addEventListener('click', () => {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!NO_BACKUP.test(k)) data[k] = localStorage.getItem(k); }
  const blob = new Blob([JSON.stringify({ app: 'spindro', version: 1, date: new Date().toISOString(), data })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `spindro-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(t('backup.exported'));
});
// ---------- Beta web: copia i dati dell'app stabile (stessa origine) nello spazio "beta:" ----------
// Solo in una direzione: stabile -> beta. Lo shim (scripts/beta-storage-shim.js) espone lo Storage vero come window.__spindroStable.
if (window.__spindroStable) {
  $('betaCopy').hidden = false;
  $('betaCopy').addEventListener('click', async () => {
    const { storage, prefix } = window.__spindroStable;
    const keys = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && !k.startsWith(prefix) && !NO_BACKUP.test(k)) keys.push(k); }
    if (!keys.length) return toast(t('beta.copyNone'));
    if (!await ask(t('beta.copyConfirm'))) return;
    keys.forEach((k) => localStorage.setItem(k, storage.getItem(k)));
    toast(t('beta.copyDone')); setTimeout(() => location.reload(), 900);
  });
}
// ---------- Cancella tutti i dati di questo dispositivo ----------
$('wipeData').addEventListener('click', async () => {
  if (!await ask(t('wipe.confirm'), { ok: t('wipe.go'), danger: true })) return;
  try { const sy = await import('./account/sync.js'); sy.stopSync(); sy.resetSyncState(); } catch { /* account non attivo */ }
  try { strava.disconnect(); } catch { /* niente */ }
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* niente storage */ }
  toast(t('wipe.done'));
  setTimeout(() => location.reload(), 900);
});
$('backupIn').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'spindro' && j.app !== 'ride-freedom' || typeof j.data !== 'object') throw new Error(t('backup.notSpindro'));
    // lo storico si unisce (niente doppioni), il resto si sovrascrive
    const mine = history(); const theirs = JSON.parse(j.data.rideHistory || '[]');
    const merged = [...new Map([...mine, ...theirs].map((h) => [h.t, h])).values()].sort((a, b) => a.t - b.t);
    if (!(await ask(t('backup.confirm', { count: theirs.length, total: merged.length })))) return;
    for (const [k, v] of Object.entries(j.data)) if (!NO_BACKUP.test(k) && k !== 'rideHistory') localStorage.setItem(k, v);
    saveHistory(merged.slice(-200));
    toast(t('backup.imported')); setTimeout(() => location.reload(), 900);
  } catch (err) { toast(t('backup.failed', { error: err.message })); }
});

// ---------- Obiettivo settimanale ----------
function goalState(hist) {
  const goal = Number(localStorage.getItem('weekGoal')) || 0; if (!goal) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const done = Math.round(hist.filter((h) => h.t >= d.getTime()).reduce((a, h) => a + h.dur, 0) / 60);
  return { goal, done };
}
function goalHtml(hist) {
  const g = goalState(hist); if (!g) return '';
  const pct = Math.min(100, Math.round((g.done / g.goal) * 100));
  return `<div class="goal"><span class="goal-txt">${t('goal.progress', { done: g.done, goal: g.goal })}${pct >= 100 ? ` · ${t('goal.reached')}` : ''}</span><span class="goal-bar"><i style="width:${pct}%"></i></span></div>`;
}
function renderGoalChips() { const g = Number(localStorage.getItem('weekGoal')) || 0; document.querySelectorAll('#goalChips button').forEach((b) => b.classList.toggle('on', +b.dataset.g === g)); }
document.querySelectorAll('#goalChips button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('weekGoal', b.dataset.g); renderGoalChips(); renderWelcome(); }));
renderGoalChips();

// ---------- Editor allenamenti ed esportazione ----------
let editor = null;
async function openEditor(w) {
  if (!editor) {
    const { WorkoutEditor } = await import('./editor.js');
    editor = new WorkoutEditor($('editorBody'), {
      ftp: state.ftp,
      onSave: (w) => {
        const list = customWorkouts().filter((x) => x.id !== w.id);
        localStorage.setItem('customWorkouts', JSON.stringify([w, ...list].slice(0, 30))); dataChanged('workouts', w.id);
        closeSheet('editorSheet'); toast(t('editor.saved', { name: w.name }));
        renderWorkoutList(); openSheet('workoutSheet');
      },
    });
  }
  editor.ftp = state.ftp; editor.open(w);
  $('editorTitle').textContent = w?.custom ? t('editor.edit') : t('editor.create');
  closeSheet('workoutSheet'); openSheet('editorSheet');
}
// file da salvare: sul telefono si apre la condivisione (Drive, email, Garmin…), sul PC si scarica
async function offerFile(file, hint) {
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); toast(hint); return; }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(t('workouts.downloaded', { file: file.name, hint }));
}

// ---------- Cambio automatico (tiene la cadenza scelta) e coach vocale ----------
let shiftHold = 0; const cadBuf = [];
function autoShiftTick() {
  if (state.mode !== 'gears' || !$('autoShift').checked || activeGame?.active) { cadBuf.length = 0; return; }
  const cad = currentCadence(); if (cad < 40) { cadBuf.length = 0; return; }
  cadBuf.push(cad); if (cadBuf.length > 3) cadBuf.shift();
  if (shiftHold > 0) { shiftHold--; return; }
  if (cadBuf.length < 3) return;
  const avg = cadBuf.reduce((a, b) => a + b, 0) / 3; const target = Number(localStorage.getItem('autoCad')) || 90;
  // fuori di più di 6 rpm per 3 secondi: una marcia alla volta, poi si aspetta che la gamba si adatti
  if (avg < target - 6 && state.gear > 0) { shift(-1); shiftHold = 3; cadBuf.length = 0; }
  else if (avg > target + 6 && state.gear < GEARS.length - 1) { shift(+1); shiftHold = 3; cadBuf.length = 0; }
}
function renderAutoShift() {
  const on = localStorage.getItem('autoShift') === '1'; const c = Number(localStorage.getItem('autoCad')) || 90;
  $('autoShift').checked = on; $('cadChips').hidden = !on;
  document.querySelectorAll('#cadChips button').forEach((b) => b.classList.toggle('on', +b.dataset.c === c));
}
$('autoShift').addEventListener('change', () => { localStorage.setItem('autoShift', $('autoShift').checked ? '1' : '0'); renderAutoShift(); if ($('autoShift').checked) toast(t('auto.shiftOn')); });
document.querySelectorAll('#cadChips button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('autoCad', b.dataset.c); renderAutoShift(); }));
renderAutoShift();
$('coachOn').checked = coach.on;
$('coachOn').addEventListener('change', () => { coach.on = $('coachOn').checked; if (coach.on) coach.say(t('coach.hello'), { force: true }); });

$('gameGlow').checked = glowSetting.on;
$('gameGlow').addEventListener('change', () => { glowSetting.on = $('gameGlow').checked; });
// qualità grafica dei giochi 3D (stessa chiave di games/kit/quality.js): auto misura i fps all'avvio
try { $('gameQuality').value = localStorage.getItem('gameQuality') || 'auto'; } catch { /* niente storage */ }
$('gameQuality').addEventListener('change', () => { try { localStorage.setItem('gameQuality', $('gameQuality').value); if ($('gameQuality').value === 'auto') localStorage.removeItem('gameQualityAuto'); } catch { /* niente storage */ } });

// ---------- Navigazione con il Click, tasto indietro e link condivisi ----------
const inGame = () => activeGame?.active && $('gameMenu').hidden && !document.querySelector('.video-pick:not([hidden])');
const clickNav = createClickNav({
  enabled: () => click.connected,
  // "in azione" = uscita in corso, allenamento o gioco aperto: + / − lavorano per la bici o per il gioco
  playing: () => !!(state.ride.running || workout || (activeGame?.active && $('gameMenu').hidden)),
  inGame: () => !!(activeGame?.active && $('gameMenu').hidden && !document.querySelector('.video-pick:not([hidden])')),
  caps: () => click.caps,
  blocked: () => clickCheck.isOpen(), // durante la verifica tasti i tasti non navigano né cambiano marcia
  undo: () => { if (!activeGame?.active) step(+1); }, // la pressione lunga di − è già stata contata come un −
  back: () => window.rfBack(),
  // il primo tasto del menu è quello principale della scheda "Oggi" (nel cruscotto: Pausa/Riprendi)
  prefer: () => (!trainer.connected ? ($('welcomeConnect') && !$('welcome').hidden ? $('welcomeConnect') : $('deviceBar')) : ($('today').classList.contains('plan-due') && !isRiding() ? document.querySelector('#planCard [data-pl-start]') || $('startStop') : $('startStop'))),
  onChange: (on) => document.body.classList.toggle('click-nav', on),
  // voci del menu Click, in ordine di utilità: prima ciò che serve adesso (avviare / mettere in pausa), poi il resto
  menuItems: () => {
    const rec = { icon: state.ride.running ? 'pause' : 'play', label: t(state.ride.running ? 'clickmenu.pause' : state.ride.log.length ? 'clickmenu.resume' : 'clickmenu.start'), run: () => $('startStop').click() };
    const music = GarminBridge && $('musicOn').checked ? [{ icon: 'music', label: t('clickmenu.music'), run: () => GarminBridge.mediaKey({ key: 'playpause' }).then(() => toast(t('music.playPause'))).catch((err) => log(`Music: ${err.message}`)) }] : [];
    const check = { icon: 'controller', label: t('clickmenu.check'), run: () => clickCheck.open() };
    const devices = { icon: 'trainer', label: t('clickmenu.devices'), run: () => devicesUi.open() };
    const settings = { icon: 'settings', label: t('clickmenu.settings'), run: () => $('openSettings').click() };
    const workouts = { icon: 'workouts', label: t('clickmenu.workouts'), run: () => $('openWorkouts').click() };
    const games = { icon: 'games', label: t('clickmenu.games'), run: () => openGame() };
    const video = { icon: 'video', label: t('clickmenu.video'), run: () => { openGame(); startGame('video'); } };
    const history = { icon: 'history', label: t('clickmenu.history'), run: () => openHistory() };
    const home = { icon: 'home', label: t('clickmenu.home'), run: () => closeEverything() };
    if (inGame()) {
      return [
        { icon: 'play', label: t('clickmenu.resumeGame'), run: () => {} },
        { icon: gameAudio.muted ? 'soundOn' : 'soundOff', label: gameAudio.muted ? t('clickmenu.audioOn') : t('clickmenu.audioOff'), run: () => $('muteGame').click() },
        rec, ...music,
        { icon: 'exit', label: t('clickmenu.exitGame'), run: () => closeGame() },
        { icon: 'home', label: t('clickmenu.home'), run: () => { closeGame(); closeGame(); } },
        check,
      ];
    }
    const open = overlayOpen();
    const finish = state.ride.log.length ? [{ icon: 'flag', label: t('clickmenu.finish'), run: () => $('finishRide').click() }] : [];
    const endWk = workout ? [{ icon: 'stop', label: t('clickmenu.endWorkout'), run: () => $('wkStop').click() }] : [];
    const close = { icon: 'close', label: t('clickmenu.close'), run: () => clickNav.stop() };
    if (isRiding() || workout) { // in uscita: pausa e fine per prime, poi cosa si può fare mentre si pedala
      return [rec, ...finish, ...endWk, ...(open ? [home] : []), ...music, games, video, workouts, devices, settings, history, check, close];
    }
    // a riposo: senza rullo il primo bisogno è collegarlo; poi partire, scegliere cosa fare, il resto
    return [...(trainer.connected ? [rec] : [devices, rec]), ...(open ? [home] : []), workouts, games, video, history, ...(trainer.connected ? [devices] : []), settings, check, close];
  },
});
// Verifica tasti ("Controlla il tuo controller"): si apre da sola al primo collegamento, dal pannello Dispositivi e dal menu Click
const clickCheck = createClickCheck({ click, t, playing: () => playingNow() || !!activeGame?.active });
click.addEventListener('disconnected', () => clickNav.releaseAll());
// da tastiera: M apre il menu Click (comodo anche per provarlo dal PC)
window.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && e.target.tagName !== 'INPUT') clickNav.toggle(); });
const overlayOpen = () => clickNav.overlay() && !clickNav.menuOpen();
function closeEverything() { // torna alla home da qualsiasi schermata
  clickCheck.close();
  document.querySelectorAll('.calib').forEach((c) => (c._cancel ? c._cancel() : c.remove()));
  for (const sh of document.querySelectorAll('.sheet')) if (!sh.hidden) closeSheet(sh.id);
  if (!$('debugPanel').hidden) $('closeDebug').click();
  if (activeGame) closeGame();
  if (!$('gamePanel').hidden) closeGame();
}

// tasto indietro (Android e browser): chiude ciò che è aperto; per uscire va premuto due volte
let backArmed = 0;
window.rfBack = () => {
  if (clickCheck.isOpen()) { clickCheck.close(); return 'ok'; }
  if (clickNav.menuOpen()) { clickNav.closeMenu(); return 'ok'; }
  const dlg = [...document.querySelectorAll('.calib')].pop();
  if (dlg) { const c = dlg.querySelector('.calib-cancel'); if (dlg._cancel) dlg._cancel(); else if (c) c.click(); else dlg.remove(); return 'ok'; }
  const sheets = [...document.querySelectorAll('.sheet')].filter((x) => !x.hidden);
  if (sheets.length) { closeSheet(sheets[sheets.length - 1].id); return 'ok'; }
  if (!$('debugPanel').hidden) { $('closeDebug').click(); return 'ok'; }
  if (!$('gamePanel').hidden) { closeGame(); return 'ok'; }
  if (Date.now() - backArmed < 2500) return state.ride.running ? 'background' : 'exit';
  backArmed = Date.now();
  toast(state.ride.running ? t('back.background') : t('back.exit'));
  return 'ok';
};
if (!isNative) {
  // nel browser il tasto indietro passa dalla cronologia: teniamo un "segnaposto" per intercettarlo
  window.history.pushState({ rf: 1 }, '');
  window.addEventListener('popstate', () => { if (window.rfBack() === 'ok') window.history.pushState({ rf: 1 }, ''); else window.history.back(); });
}

// link condiviso da YouTube (Condividi → Spindro): apre "Pedala su un video" con quel video
window.rfShared = (text) => {
  const m = String(text).match(/https?:\/\/\S+/); const url = m ? m[0] : String(text).trim();
  if (!/youtu\.?be/.test(url)) { toast(t('share.notYoutube')); return; }
  for (const sh of document.querySelectorAll('.sheet')) if (!sh.hidden) closeSheet(sh.id);
  if (activeGame) closeGame();
  openGame(); startGame('video').then(() => games.video?.game.openUrl(url));
  toast(t('share.received'));
};
if (window.rfPendingShare) { window.rfShared(window.rfPendingShare); window.rfPendingShare = null; }

// ---------- Lingua: selettore nelle Impostazioni e aggiornamento al volo ----------
const langSelect = $('langSelect');
for (const [code, name] of Object.entries(LANGS)) langSelect.add(new Option(name, code));
langSelect.value = getLang();
langSelect.addEventListener('change', () => setLang(langSelect.value));
// ciò che il codice scrive da solo (stati, elenchi, pannelli aperti) va rifatto; l'HTML statico lo rifà applyI18n
window.addEventListener('langchange', () => {
  langSelect.value = getLang();
  refreshDeviceBar(); devicesUi.update();
  if (!$('garminOn').checked) setStatus('garminStatus', t('status.off'));
  showVersion(); showMute(); renderStrava(); renderWelcome(); render(); checkGarminConflict();
  $('wkFtp').textContent = state.ftp;
  if (!$('workoutSheet').hidden) { renderWorkoutList(); renderRoutePick(); if (!$('wkPanePlans').hidden) plans.renderPane(); }
  if (!$('historySheet').hidden) openHistory();
  if (!$('gamePanel').hidden) {
    if (activeGame) { $('gameTitle').textContent = t(GAME_DEFS[activeKind].title); $('gameHelp').textContent = t(GAME_DEFS[activeKind].help); }
    else { $('gameTitle').textContent = t('games.title'); progress.renderMenu($('progressPanel')); }
  }
});

// ---------- Account facoltativo: compare solo se js/config.js ha FIREBASE_CONFIG ----------
initAccount();
