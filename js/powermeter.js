// Misuratore di potenza (Bluetooth Cycling Power) o sensore di cadenza/velocità (Cycling Speed and Cadence)
// di qualsiasi marca: pedali Garmin Rally/Vector, Favero, guarniture, Wahoo RPM, Garmin, Magene, ecc.
// Emette 'data' con { power?, cadence?, speed? } (speed in km/h, solo se il sensore ha la ruota).
// Il ruolo (potenza o cadenza) lo decide js/devices.js; qui si legge solo il servizio presente.
import { SensorDebug } from './debug.js';
import { t } from './i18n.js';
import { listen } from './ble-util.js';

const CPS = 0x1818;
const CSC = 0x1816;
const STALE_MS = 2500;   // senza nuovi giri per 2,5 s la cadenza è 0
const WHEEL_M = 2.105;   // circonferenza ruota 700×25C, usata solo per la velocità del sensore di ruota

/** CSC (0x2a5b): flag bit0 = ruota (giri uint32 + tempo uint16), bit1 = pedivella (giri uint16 + tempo uint16, 1/1024 s). */
export function parseCsc(v) {
  const flags = v.getUint8(0);
  let o = 1;
  const out = { wheel: null, crank: null };
  if (flags & 0x01) { out.wheel = { revs: v.getUint32(o, true), t: v.getUint16(o + 4, true) }; o += 6; }
  if (flags & 0x02) out.crank = { revs: v.getUint16(o, true), t: v.getUint16(o + 2, true) };
  return out;
}

/** Giri al minuto tra due letture. Il tempo è a 16 bit e riparte da zero (rollover): si lavora in modulo.
 *  Ritorna undefined se non si può dire nulla (prima lettura), 0 se fermo da oltre 2,5 s. `bits` = 16 (pedivella) o 32 (ruota). */
export function rate(prev, cur, now, bits = 16) {
  if (!prev) return undefined;
  const mod = bits === 32 ? 0x100000000 : 0x10000;
  const dr = (cur.revs - prev.revs + mod) % mod;
  const dt = ((cur.t - prev.t) & 0xffff) / 1024;
  if (dr > 0 && dt > 0) return (dr / dt) * 60;
  if (now - prev.at > STALE_MS) return 0;
  return undefined;
}

export class PowerMeter extends EventTarget {
  constructor(dbg) {
    super();
    this.device = null; this.kind = null; // 'power' | 'csc'
    this.dbg = dbg || new SensorDebug('pm', 'Power meter / cadence');
    this.prev = null; this.prevWheel = null;
    this.hasCadence = false; this.hasWheel = false; // dedotti dai pacchetti ricevuti
    this.staleTimer = null;
  }
  get connected() { return !!this.device?.gatt?.connected; }
  get name() { return this.device?.name || t('pm.title'); }

  /** `device`: già scelto da js/devices.js; senza, apre da solo la scelta Bluetooth (uso diretto/test). */
  async connect(device, { kind } = {}) {
    this.device = device || await navigator.bluetooth.requestDevice({ filters: [{ services: [CPS] }, { services: [CSC] }], optionalServices: [CPS, CSC, 0x180f] });
    listen(this, 'disc', this.device, 'gattserverdisconnected', () => { clearInterval(this.staleTimer); this.dbg.setStatus('Disconnected'); this.dispatchEvent(new Event('disconnected')); });
    this.dbg.setStatus('Connecting…');
    const server = await this.device.gatt.connect();
    await this.dbg.describe(this.device, server);
    let svc = null;
    if (kind !== 'csc') { try { svc = await server.getPrimaryService(CPS); } catch { /* sensore di sola cadenza */ } }
    if (svc) {
      this.kind = 'power';
      const c = await svc.getCharacteristic(0x2a63);
      listen(this, 'ch', c, 'characteristicvaluechanged', (e) => this.onData(e.target.value));
      await c.startNotifications();
    } else {
      this.kind = 'csc';
      const c = await (await server.getPrimaryService(CSC)).getCharacteristic(0x2a5b);
      listen(this, 'ch', c, 'characteristicvaluechanged', (e) => this.onCsc(e.target.value));
      await c.startNotifications();
    }
    // alcuni sensori smettono di notificare quando la pedivella è ferma: dopo 2,5 s la cadenza torna a 0
    this.staleTimer = setInterval(() => {
      if (this.hasCadence && this.prev && performance.now() - this.prev.at > STALE_MS && !this.zeroSent) { this.zeroSent = true; this.emitData({ cadence: 0 }); }
    }, 500);
    this.dbg.setStatus('Connected');
    return this.device.name || t('pm.title');
  }

  disconnect() { clearInterval(this.staleTimer); if (this.connected) this.device.gatt.disconnect(); }

  emitData(d) { this.dbg.setValues(d); this.dispatchEvent(new CustomEvent('data', { detail: d })); }

  /** Aggiorna lo stato dei giri della pedivella e ritorna la cadenza (rpm) se si può calcolare. */
  crank(cr) {
    this.hasCadence = true;
    const now = performance.now();
    const c = rate(this.prev, cr, now);
    if (!this.prev || this.prev.revs !== cr.revs) { this.prev = { revs: cr.revs, t: cr.t, at: now }; this.zeroSent = false; }
    return c;
  }

  onCsc(v) {
    this.dbg.raw('rx', 0x2a5b, v);
    const { wheel, crank } = parseCsc(v);
    const d = {};
    if (crank) { const c = this.crank(crank); if (c != null) d.cadence = c; }
    if (wheel) {
      this.hasWheel = true;
      const now = performance.now();
      const w = rate(this.prevWheel, wheel, now, 32);
      if (!this.prevWheel || this.prevWheel.revs !== wheel.revs) this.prevWheel = { revs: wheel.revs, t: wheel.t, at: now };
      if (w != null) d.speed = (w / 60) * WHEEL_M * 3.6;
    }
    if (Object.keys(d).length) this.emitData(d);
  }

  onData(v) {
    this.dbg.raw('rx', 0x2a63, v);
    const flags = v.getUint16(0, true);
    const d = { power: v.getInt16(2, true) };
    let o = 4;
    if (flags & 0x01) o += 1;   // bilanciamento
    if (flags & 0x04) o += 2;   // coppia accumulata
    if (flags & 0x10) o += 6;   // giri ruota
    if (flags & 0x20) {         // giri pedivella -> cadenza
      const c = this.crank({ revs: v.getUint16(o, true), t: v.getUint16(o + 2, true) });
      if (c != null) d.cadence = c;
    }
    this.emitData(d);
  }
}
