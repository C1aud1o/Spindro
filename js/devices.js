// Dispositivi Bluetooth: una sola scelta "Aggiungi dispositivo" per tutto, poi l'app legge i servizi e assegna da sola il ruolo.
//   FTMS / Tacx FE-C / Wahoo / nome noto → rullo          Heart Rate → cardio
//   servizio Zwift o nome "Zwift…" → comandi (Click/Play/Ride)
//   CSC → sensore di cadenza (e/o velocità)               Cycling Power + CSC → misuratore di potenza (con cadenza)
//   solo Cycling Power → ambiguo (rullo o misuratore?): si chiede una volta e si ricorda
// Un dispositivo con più servizi copre più ruoli. L'app non tocca Bluetooth da sola: qui si decide, i driver restano
// quelli di sempre (js/trainers, js/hr.js, js/click.js, js/powermeter.js).
import { PowerMeter } from './powermeter.js';
import { FEC_SERVICE } from './trainers/fec.js';
import { WAHOO_CONTROL } from './trainers/wahoo.js';
import { t } from './i18n.js';

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
  if (ZWIFT_SERVICES.some(has) || /^Zwift/i.test(name)) roles.push('click');
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

export class Devices extends EventTarget {
  constructor({ trainer, click, hrm, ask, meterDbg }) {
    super();
    Object.assign(this, { trainer, click, hrm, ask, meterDbg });
    this.entries = []; // { device, name, roles:[], switchable, battery }
    this.meters = [];  // PowerMeter collegati (potenza o cadenza)
    this.busy = false;
    for (const d of [trainer, hrm, click]) d.addEventListener('disconnected', () => this.sync());
  }

  changed() { this.dispatchEvent(new Event('change')); }
  /** Toglie i dispositivi non più collegati. */
  sync() {
    this.entries = this.entries.filter((e) => e.device?.gatt?.connected);
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
    list.unshift({ id: entry.device.id, name: entry.name, roles: entry.roles.filter((r) => r !== '?') });
    saveJson('devKnown', list.slice(0, 8));
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

  /** Scelta Bluetooth unica, poi assegna i ruoli. Ritorna la voce creata. */
  async add() {
    const device = await navigator.bluetooth.requestDevice(REQUEST);
    return this.attach(device);
  }

  /** `force`: ruoli già decisi (ricollegamento o cambio ruolo): niente domande. */
  async attach(device, { force = null } = {}) {
    if (this.entries.some((e) => e.device.id === device.id && e.device.gatt?.connected) && !force) throw new Error('Device already connected');
    this.busy = true; this.changed();
    try {
      const server = await device.gatt.connect();
      let roles; let ambiguous = false;
      if (force) roles = force;
      else {
        const { uuids, wahoo } = await this.readServices(server, device);
        const cls = classify(uuids, device.name || '', { wahoo, remembered: this.rememberedRole(device) });
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
        if (!roles.length) { try { device.gatt.disconnect(); } catch { /* */ } throw new Error('No supported service'); }
      }
      const entry = { device, name: device.name || '', roles: [...roles], switchable: ambiguous || !!this.rememberedRole(device), battery: null };
      this.entries = this.entries.filter((e) => e.device.id !== device.id);
      this.entries.push(entry);
      for (const r of roles) await this.connectRole(r, device, entry);
      entry.battery = await this.readBattery(server);
      this.remember(entry);
      return entry;
    } finally { this.busy = false; this.changed(); }
  }

  async connectRole(role, device, entry) {
    if (role === 'trainer') {
      if (this.trainer.connected && this.trainer.device !== device) this.trainer.disconnect();
      const name = await this.trainer.connect(device); entry.name = name || entry.name;
    } else if (role === 'hr') {
      if (this.hrm.connected && this.hrm.device !== device) this.hrm.disconnect();
      await this.hrm.connect(device);
    } else if (role === 'click') {
      await this.click.connect(device);
    } else if (role === 'power' || role === 'cadence') {
      const m = new PowerMeter(this.meterDbg); m.entry = entry;
      this.meters.push(m);
      m.addEventListener('disconnected', () => this.sync());
      try { await m.connect(device, { kind: role === 'cadence' ? 'csc' : undefined }); } catch (err) { this.meters = this.meters.filter((x) => x !== m); throw err; }
      this.dispatchEvent(new CustomEvent('meter', { detail: m }));
    }
  }

  /** Scollega un dispositivo (tutti i suoi ruoli). */
  remove(entry) {
    try { entry.device.gatt.disconnect(); } catch { /* */ }
    this.sync();
  }

  /** Cambio ruolo dal pannello (per i dispositivi ambigui): si ricollega con l'altro ruolo e si ricorda. */
  async setRole(entry, role) {
    const device = entry.device;
    this.rememberRole(device, role);
    try { device.gatt.disconnect(); } catch { /* */ }
    this.sync();
    await new Promise((r) => setTimeout(r, 50));
    return this.attach(device, { force: [role] });
  }

  disconnectAll() { for (const e of [...this.entries]) this.remove(e); }

  /** All'avvio: ritenta i dispositivi già usati, in silenzio. Browser: navigator.bluetooth.getDevices(); app: il plugin. */
  async reconnectKnown() {
    const known = loadJson('devKnown', []);
    if (!known.length || typeof navigator.bluetooth?.getDevices !== 'function') return 0;
    let n = 0;
    try {
      const devs = await navigator.bluetooth.getDevices();
      for (const k of known) {
        const device = devs.find((d) => d.id === k.id);
        if (!device || this.entries.some((e) => e.device.id === device.id)) continue;
        try {
          await Promise.race([this.attach(device, { force: k.roles }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
          n++;
        } catch { try { device.gatt.disconnect(); } catch { /* */ } this.sync(); }
      }
    } catch { /* nessun errore visibile */ }
    return n;
  }
}
