// Dispositivi Bluetooth: una sola scelta "Aggiungi dispositivo" per tutto, poi l'app legge i servizi e assegna da sola il ruolo.
//   FTMS / Tacx FE-C / Wahoo / nome noto → rullo          Heart Rate → cardio
//   servizio Zwift o nome "Zwift…" → comandi (Click/Play/Ride)
//   CSC → sensore di cadenza (e/o velocità)               Cycling Power + CSC → misuratore di potenza (con cadenza)
//   solo Cycling Power → ambiguo (rullo o misuratore?): si chiede una volta e si ricorda
// Un dispositivo con più servizi copre più ruoli. L'app non tocca Bluetooth da sola: qui si decide, i driver restano
// quelli di sempre (js/trainers, js/hr.js, js/click.js, js/powermeter.js).
// Qui vive anche la tenuta: se un dispositivo cade lo si ritenta con attese crescenti (1, 2, 5, 10 s…) e si rimettono i ruoli;
// all'avvio si ricollegano quelli già usati (stato "Ricollego…" per dispositivo). Eventi: change, meter, drop, back, lost, notice.
import { PowerMeter } from './powermeter.js';
import { FEC_SERVICE } from './trainers/fec.js';
import { WAHOO_CONTROL } from './trainers/wahoo.js';
import { t } from './i18n.js';
import { serviceName } from './trainers/index.js';
import { listen } from './ble-util.js';
import { BACKOFF_MS, IDLE_ATTEMPTS, KIND_FILTERS, backoffAt } from './connect.js';

const FTMS = 0x1826, CPS = 0x1818, CSC = 0x1816, HRS = 0x180d, BAT = 0x180f;
const ZWIFT_SERVICES = ['00000001-19ca-4651-86e5-fa29dcdd09d1', 0xfc82];
const TRAINER_NAMES = ['Tacx', 'D100', 'VAN RYSEL', 'Van Rysel'];
export const TRAINER_PREFIXES = TRAINER_NAMES;

/** Tutto ciò che l'app sa usare, in una sola richiesta Bluetooth. */
export const REQUEST = {
  filters: [
    { services: [FTMS] }, { services: [CPS] }, { services: [CSC] }, { services: [HRS] }, { services: [FEC_SERVICE] },
    { services: [0xfc82] }, { namePrefix: 'Zwift' },
    ...TRAINER_NAMES.map((namePrefix) => ({ namePrefix })),
  ],
  optionalServices: [FTMS, CPS, CSC, HRS, BAT, FEC_SERVICE, ...ZWIFT_SERVICES, 'device_information'],
};

const full = (u) => (typeof u === 'number' ? `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb` : String(u).toLowerCase());

/** Pura: dai servizi (UUID) e dal nome ai ruoli. `wahoo` = Cycling Power con il comando Wahoo.
 *  `remembered` = ruolo scelto altre volte per i dispositivi ambigui ('trainer' | 'power'). */
export function classify(uuids, name = '', { wahoo = false, remembered = null } = {}) {
  const has = (u) => uuids.includes(full(u));
  const roles = [];
  let ambiguous = false;
  const trainerByName = TRAINER_NAMES.some((p) => name.startsWith(p));
  const trainer = has(FTMS) || has(FEC_SERVICE) || wahoo || trainerByName;
  if (trainer) roles.push('trainer');
  if (has(HRS)) roles.push('hr');
  // I rulli "Zwift Ready" (D100, Kickr Core, Zwift Hub…) espongono anche il servizio Zwift per il cambio virtuale:
  // restano rulli e basta. Trattarli da telecomando faceva partire l'handshake dei Click sul rullo e cadere la connessione.
  if (!trainer && (ZWIFT_SERVICES.some(has) || /^Zwift/i.test(name))) roles.push('click');
  const cps = has(CPS); const csc = has(CSC);
  if (!trainer && cps) {
    if (csc || remembered === 'power') roles.push('power'); // misuratore con cadenza: non può essere un rullo
    else if (remembered === 'trainer') roles.push('trainer');
    else { ambiguous = true; roles.push('?'); }
  } else if (csc && !roles.includes('trainer')) roles.push('cadence');
  return { roles, ambiguous, cps, csc };
}

const safe = (fn, d) => { try { return fn(); } catch { return d; } };
const loadJson = (k, d) => safe(() => JSON.parse(localStorage.getItem(k) || ''), d) ?? d;
const saveJson = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTH = 30 * 86400000;

export class Devices extends EventTarget {
  constructor({ trainer, click, hrm, ask, meterDbg, isRiding = () => false }) {
    super();
    Object.assign(this, { trainer, click, hrm, ask, meterDbg, isRiding });
    // entry: { device, name, roles:[], switchable, battery, state:'connected'|'reconnecting'|'lost', wanted, lastData, attempt, nextTry, proto }
    this.entries = [];
    this.pending = []; // dispositivi già usati, non ancora ricollegati all'avvio: { id, name, roles, state:'reconnecting'|'tap'|'failed' }
    this.meters = [];  // PowerMeter collegati (potenza o cadenza)
    this.busyN = 0;
    this.backoffMs = BACKOFF_MS; // i test lo accorciano
    for (const d of [trainer, hrm, click]) d.addEventListener('disconnected', () => this.sync());
    // segno di vita: quando è arrivato l'ultimo dato di ogni dispositivo
    trainer.addEventListener('data', () => this.stamp('trainer'));
    hrm.addEventListener('hr', () => this.stamp('hr'));
    for (const ev of ['press', 'shift']) click.addEventListener(ev, () => this.stamp('click'));
  }

  get busy() { return this.busyN > 0; }
  changed() { this.dispatchEvent(new Event('change')); }
  notice(key, params) { this.dispatchEvent(new CustomEvent('notice', { detail: t(key, params) })); }
  stamp(role) { const e = this.entries.find((x) => x.roles.includes(role)); if (e) e.lastData = Date.now(); }
  isUp(entry) { return !!entry.device?.gatt?.connected; }
  entryOf(device) { return this.entries.find((e) => e.device === device || e.device.id === device?.id); }

  /** Aggiorna lo stato di ogni voce. Una voce che cade resta (in "ricollego"); sparisce solo se l'ha tolta la persona. */
  sync() {
    this.entries = this.entries.filter((e) => e.wanted !== false);
    for (const e of this.entries) if (this.isUp(e)) e.state = 'connected'; else if (e.state === 'connected') e.state = 'reconnecting';
    this.meters = this.meters.filter((m) => m.connected);
    this.changed();
  }

  rememberedRole(device) {
    const m = loadJson('devRoles', {});
    return m[device.id] || m[`n:${device.name || ''}`] || null;
  }
  rememberRole(device, role) {
    const m = loadJson('devRoles', {});
    m[device.id] = role; if (device.name) m[`n:${device.name}`] = role;
    saveJson('devRoles', m);
  }
  remember(entry) {
    const list = loadJson('devKnown', []).filter((k) => k.id !== entry.device.id);
    list.unshift({ id: entry.device.id, name: entry.name, roles: entry.roles.filter((r) => r !== '?'), at: Date.now() });
    saveJson('devKnown', list.slice(0, 8));
  }
  /** "Dimentica": toglie un dispositivo dall'elenco dei già usati (e dai "da ricollegare"). */
  forget(id) {
    saveJson('devKnown', loadJson('devKnown', []).filter((k) => k.id !== id));
    this.pending = this.pending.filter((k) => k.id !== id);
    this.changed();
  }

  async readServices(server, device) {
    let uuids = [];
    try { uuids = (await server.getPrimaryServices()).map((s) => String(s.uuid).toLowerCase()); } catch { /* alcuni stack non li elencano */ }
    if (!uuids.length) {
      for (const u of [FTMS, CPS, CSC, HRS, FEC_SERVICE, ...ZWIFT_SERVICES]) { try { await server.getPrimaryService(u); uuids.push(full(u)); } catch { /* non c'è */ } }
    }
    let wahoo = false;
    if (uuids.includes(full(CPS))) { try { await (await server.getPrimaryService(CPS)).getCharacteristic(WAHOO_CONTROL); wahoo = true; } catch { /* non è un Wahoo */ } }
    return { uuids, wahoo };
  }

  async readBattery(server) {
    try { return (await (await (await server.getPrimaryService(BAT)).getCharacteristic(0x2a19)).readValue()).getUint8(0); } catch { return null; }
  }
  /** Rilegge la batteria dei dispositivi collegati (all'apertura del pannello). */
  async refreshBattery() {
    for (const e of this.entries) if (this.isUp(e)) { const b = await this.readBattery(e.device.gatt); if (b != null && b !== e.battery) { e.battery = b; this.changed(); } }
  }

  /** Scelta Bluetooth, poi assegna i ruoli. `kind` ('click' | 'hr'): la lista del browser mostra solo quel tipo (suggerimento "aggiungi i comandi"). */
  async add({ kind = null } = {}) {
    const device = await navigator.bluetooth.requestDevice(KIND_FILTERS[kind] ? { filters: KIND_FILTERS[kind], optionalServices: REQUEST.optionalServices } : REQUEST);
    try { return await this.attach(device); } catch (err) { err.afterPick = true; err.deviceName = device.name || ''; throw err; }
  }

  /** `force`: ruoli già decisi (ricollegamento o cambio ruolo): niente domande. `silent`: tentativo automatico, non occupa il pannello. */
  async attach(device, { force = null, silent = false } = {}) {
    let entry = this.entries.find((e) => e.device.id === device.id);
    if (entry && this.isUp(entry) && !force) { const err = new Error('Device already connected'); err.deviceName = device.name || entry.name; throw err; }
    const fresh = !entry;
    if (!silent) { this.busyN++; this.changed(); }
    try {
      const server = await device.gatt.connect();
      let roles; let ambiguous = false; let uuids = [];
      if (force) roles = force.includes('trainer') ? force.filter((r) => r !== 'click') : force; // ruoli salvati da versioni vecchie
      else {
        const info = await this.readServices(server, device); uuids = info.uuids;
        const cls = classify(uuids, device.name || '', { wahoo: info.wahoo, remembered: this.rememberedRole(device) });
        roles = cls.roles; ambiguous = cls.ambiguous;
        if (ambiguous) {
          // solo Cycling Power: con un rullo già collegato è quasi certamente un misuratore; altrimenti si chiede (una volta)
          if (this.trainer.connected) roles = ['power'];
          else {
            const isTrainer = await this.ask(t('devices.askTrainer', { name: device.name || '' }), { ok: t('devices.roleTrainer'), cancel: t('devices.rolePower') });
            roles = [isTrainer ? 'trainer' : 'power'];
            this.rememberRole(device, roles[0]);
          }
        }
        if (!roles.length) {
          try { device.gatt.disconnect(); } catch { /* */ }
          const err = new Error('No supported service');
          err.unsupported = { name: device.name || '', services: uuids.map(serviceName) };
          throw err;
        }
      }
      if (!entry) { entry = { device, name: device.name || '', roles: [], switchable: false, battery: null, wanted: true, lastData: 0, attempt: 0 }; this.entries.push(entry); }
      Object.assign(entry, { roles: [...roles], switchable: ambiguous || !!this.rememberedRole(device), wanted: true, state: 'connected' });
      // un rullo che ritrasmette anche il battito non deve togliere il posto alla fascia già collegata
      if (roles.includes('trainer') && roles.includes('hr') && this.hrm.connected && this.hrm.device !== device) roles = roles.filter((r) => r !== 'hr');
      entry.roles = [...roles];
      for (const [i, r] of roles.entries()) {
        // il primo ruolo è quello che conta: se fallisce un ruolo secondario il dispositivo resta collegato con il primo
        try { await this.connectRole(r, device, entry); } catch (err) { if (i === 0) throw err; entry.roles = entry.roles.filter((x) => x !== r); }
      }
      if (!this.isUp(entry)) throw new Error('Connection lost while connecting'); // caduto durante la stretta di mano
      listen(this, `drop|${device.id}`, device, 'gattserverdisconnected', () => this.onDrop(entry));
      entry.battery = await this.readBattery(server);
      entry.state = 'connected'; entry.attempt = 0;
      this.remember(entry);
      this.pending = this.pending.filter((k) => k.id !== device.id);
      if (!force && entry.roles.length > 1) this.notice('devices.multi', { name: entry.name || t('devices.unnamed'), roles: entry.roles.map((r) => t(`devices.role.${r}`).toLowerCase()).join(' + ') });
      return entry;
    } catch (err) {
      if (fresh && entry) { entry.wanted = false; this.entries = this.entries.filter((e) => e !== entry); }
      try { device.gatt.disconnect(); } catch { /* */ }
      throw err;
    } finally { if (!silent) this.busyN--; this.sync(); }
  }

  async connectRole(role, device, entry) {
    if (role === 'trainer') {
      if (this.trainer.connected && this.trainer.device !== device) this.release(this.trainer.device, 'trainer');
      const name = await this.trainer.connect(device); entry.name = name || entry.name;
      entry.proto = this.trainer.protocol;
    } else if (role === 'hr') {
      // due fonti di battito: vince l'ultima scelta, la precedente si toglie (senza scollegare un rullo che lo ritrasmette)
      if (this.hrm.connected && this.hrm.device !== device) this.release(this.hrm.device, 'hr');
      await this.hrm.connect(device);
    } else if (role === 'click') {
      await this.click.connect(device);
    } else if (role === 'power' || role === 'cadence') {
      const fresh = !entry.meter;
      const m = entry.meter || (entry.meter = new PowerMeter(this.meterDbg)); m.entry = entry;
      // lo stesso oggetto si riusa a ogni ricollegamento: niente ascoltatori né eventi doppi
      m.firstData = false; m.cadSeen = false;
      if (!this.meters.includes(m)) this.meters.push(m);
      if (fresh) {
        m.addEventListener('disconnected', () => this.sync());
        m.addEventListener('data', () => { entry.lastData = Date.now(); });
      }
      try { await m.connect(device, { kind: role === 'cadence' ? 'csc' : undefined }); } catch (err) { this.meters = this.meters.filter((x) => x !== m); throw err; }
      if (fresh) this.dispatchEvent(new CustomEvent('meter', { detail: m }));
    }
  }

  /** Toglie un ruolo da un dispositivo già collegato perché un altro lo prende (es. seconda fascia cardio). */
  release(device, role) {
    const prev = this.entryOf(device);
    if (!prev) return;
    this.notice('devices.replaced', { old: prev.name || t('devices.unnamed'), role: t(`devices.role.${role}`).toLowerCase() });
    prev.roles = prev.roles.filter((r) => r !== role);
    if (!prev.roles.length || role === 'trainer') { prev.wanted = false; try { prev.device.gatt.disconnect(); } catch { /* */ } }
  }

  /** Una connessione è caduta da sola: si ricollega in silenzio, con attese crescenti, finché dura l'uscita. */
  onDrop(entry) {
    if (entry.wanted === false) { this.sync(); return; }
    entry.state = 'reconnecting';
    entry.lostAt ||= Date.now();
    this.dispatchEvent(new CustomEvent('drop', { detail: entry }));
    this.sync();
    this.retry(entry);
  }

  async retry(entry) {
    if (entry.retrying) return;
    entry.retrying = true;
    try {
      for (;;) {
        const wait = backoffAt(this.backoffMs, entry.attempt);
        entry.nextTry = Date.now() + wait; entry.state = 'reconnecting'; this.changed();
        await sleep(wait);
        if (entry.wanted === false) return;
        if (this.isUp(entry)) break;
        if (entry.attempt >= IDLE_ATTEMPTS && !this.isRiding()) { entry.state = 'lost'; this.dispatchEvent(new CustomEvent('lost', { detail: entry })); this.changed(); return; }
        entry.attempt++;
        try { await this.attach(entry.device, { force: entry.roles.length ? entry.roles : ['trainer'], silent: true }); break; } catch { /* prossimo tentativo */ }
      }
      if (entry.wanted !== false && this.isUp(entry)) {
        entry.attempt = 0; entry.state = 'connected'; entry.lostAt = null;
        this.dispatchEvent(new CustomEvent('back', { detail: entry }));
      }
    } finally {
      entry.retrying = false;
      // caduto di nuovo mentre si chiudeva il ciclo
      if (entry.wanted !== false && !this.isUp(entry) && entry.state !== 'lost') queueMicrotask(() => this.retry(entry));
      this.sync();
    }
  }

  /** Riprova subito i dispositivi persi (l'uscita è ripartita o la persona ha toccato "Ricollega"). */
  retryLost() { for (const e of this.entries) if (e.state === 'lost' && e.wanted !== false) { e.attempt = 0; this.retry(e); } }

  /** Scollega un dispositivo (tutti i suoi ruoli). */
  remove(entry) {
    entry.wanted = false;
    try { entry.device.gatt.disconnect(); } catch { /* */ }
    this.sync();
  }

  /** Cambio ruolo dal pannello (per i dispositivi ambigui): si ricollega con l'altro ruolo e si ricorda. */
  async setRole(entry, role) {
    const device = entry.device;
    this.rememberRole(device, role);
    entry.wanted = false; // non è una caduta
    try { device.gatt.disconnect(); } catch { /* */ }
    this.sync();
    await sleep(50);
    return this.attach(device, { force: [role] });
  }

  disconnectAll() { for (const e of [...this.entries]) this.remove(e); }

  /** Dispositivi in attesa di essere ricollegati, per ruolo (riga di stato e pulsante in home). */
  pendingFor(role) { return this.pending.find((k) => k.roles.includes(role)) || null; }
  get needsTap() { return this.pending.filter((k) => k.state !== 'reconnecting'); }

  /** All'avvio: ritenta i dispositivi già usati, in silenzio, mostrando "Ricollego…" per ciascuno. Browser: navigator.bluetooth.getDevices(); app: il plugin.
   *  Se il browser non conserva il permesso, il dispositivo passa a 'tap': basta il pulsante "Ricollega" (vedi reconnectNext). */
  async reconnectKnown() {
    const known = loadJson('devKnown', []).filter((k) => !k.at || Date.now() - k.at < 3 * MONTH).slice(0, 4);
    if (!known.length) return 0;
    this.pending = known.filter((k) => !this.entries.some((e) => e.device.id === k.id)).map((k) => ({ ...k, state: 'reconnecting' }));
    this.changed();
    if (!this.pending.length) return 0;
    let devs = null;
    if (typeof navigator.bluetooth?.getDevices === 'function') { try { devs = await navigator.bluetooth.getDevices(); } catch { devs = null; } }
    let n = 0;
    // il rullo per primo: è quello che serve subito
    for (const k of [...this.pending].sort((a, b) => (b.roles.includes('trainer') ? 1 : 0) - (a.roles.includes('trainer') ? 1 : 0))) {
      const device = devs?.find((d) => d.id === k.id);
      if (!device) { k.state = 'tap'; this.changed(); continue; }
      if (this.entries.some((e) => e.device.id === device.id)) { this.pending = this.pending.filter((x) => x !== k); continue; }
      let timer;
      try {
        await Promise.race([this.attach(device, { force: k.roles, silent: true }), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 12000); })]);
        n++;
      } catch { try { device.gatt.disconnect(); } catch { /* */ } k.state = 'failed'; this.sync(); } finally { clearTimeout(timer); }
    }
    this.changed();
    return n;
  }

  /** Il pulsante "Ricollega": passa i dispositivi già usati uno alla volta. Prima senza scelta (permesso già dato), poi con la scelta del browser
   *  ristretta al nome di quel dispositivo (serve il tocco). Ritorna la voce collegata, o null se non c'è più nulla da ricollegare. */
  async reconnectNext() {
    const k = this.pending.find((x) => x.state !== 'reconnecting') || this.pending[0];
    if (!k) return null;
    k.state = 'reconnecting'; this.busyN++; this.changed();
    try {
      let device = null;
      try { device = (await navigator.bluetooth.getDevices?.() || []).find((d) => d.id === k.id) || null; } catch { /* */ }
      if (!device) {
        device = await navigator.bluetooth.requestDevice(k.name ? { filters: [{ name: k.name }], optionalServices: REQUEST.optionalServices } : REQUEST);
      }
      return await this.attach(device, { force: k.roles, silent: true });
    } catch (err) {
      k.state = 'failed'; err.deviceName = k.name; err.afterPick = true; throw err;
    } finally { this.busyN--; this.changed(); }
  }
}
