// "Rullo finto": sostituisce navigator.bluetooth con un rullo FTMS e uno Zwift Click simulati.
// Si inietta con page.addInitScript({ path }) prima che l'app parta. Dal test si pilota con window.__fakeBle.
(() => {
  const BASE = '-0000-1000-8000-00805f9b34fb';
  const full = (n) => `0000${n.toString(16).padStart(4, '0')}${BASE}`;
  const ALIAS = { heart_rate: 0x180d, heart_rate_measurement: 0x2a37, battery_service: 0x180f, battery_level: 0x2a19, cycling_power: 0x1818, cycling_speed_and_cadence: 0x1816 };
  const norm = (u) => (typeof u === 'number' ? full(u) : ALIAS[u] ? full(ALIAS[u]) : String(u).toLowerCase());

  const FTMS = full(0x1826);
  const ZWIFT = '00000001-19ca-4651-86e5-fa29dcdd09d1';
  const Z_ASYNC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
  const Z_RX = '00000003-19ca-4651-86e5-fa29dcdd09d1';
  const Z_TX = '00000004-19ca-4651-86e5-fa29dcdd09d1';

  const dv = (bytes) => new DataView(new Uint8Array(bytes).buffer);
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const varint = (n) => { const o = []; while (n > 0x7f) { o.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); } o.push(n); return o; };

  class Char extends EventTarget {
    constructor(uuid, props, onWrite, onRead) {
      super();
      this.uuid = norm(uuid);
      this.properties = { read: !!onRead, write: !!onWrite, writeWithoutResponse: false, notify: !!props.notify, indicate: false };
      this.value = null; this.onWrite = onWrite; this.onRead = onRead; this.notifying = false;
    }
    async startNotifications() { this.notifying = true; return this; }
    async stopNotifications() { this.notifying = false; return this; }
    async readValue() { if (!this.onRead) throw new DOMException('Lettura non permessa', 'NotSupportedError'); this.value = this.onRead(); return this.value; }
    async writeValueWithResponse(data) { this.onWrite?.(new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data)); }
    async writeValueWithoutResponse(data) { return this.writeValueWithResponse(data); }
    push(bytes) { // notifica al listener, se attivata
      if (!this.notifying) return;
      this.value = dv(bytes);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  }
  class Service {
    constructor(uuid, chars) { this.uuid = norm(uuid); this.chars = chars; }
    async getCharacteristic(u) {
      const c = this.chars.find((x) => x.uuid === norm(u));
      if (!c) throw new DOMException('Caratteristica non trovata', 'NotFoundError');
      return c;
    }
    async getCharacteristics() { return this.chars; }
  }
  class Device extends EventTarget {
    constructor(id, name, services) {
      super();
      this.id = id; this.name = name; this.services = services;
      const dev = this;
      this.gatt = {
        connected: false, device: dev,
        async connect() { this.connected = true; return this; },
        disconnect() { if (!this.connected) return; this.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); },
        async getPrimaryService(u) {
          const s = dev.services.find((x) => x.uuid === norm(u));
          if (!s) throw new DOMException('Servizio non trovato', 'NotFoundError');
          return s;
        },
        async getPrimaryServices() { return dev.services; },
      };
    }
  }

  // ---- Fascia cardio, sensore di cadenza (CSC), misuratore di potenza (CPS) ----
  const hrChar = new Char(0x2a37, { notify: true });
  const hrSvc = new Service(0x180d, [hrChar]);
  const cscChar = new Char(0x2a5b, { notify: true });
  const cscSvc = new Service(0x1816, [cscChar]);
  const cpsChar = new Char(0x2a63, { notify: true });
  const cpsSvc = new Service(0x1818, [cpsChar]);
  const batChar = new Char(0x2a19, {}, null, () => dv([83]));
  const batSvc = new Service(0x180f, [batChar]);
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  const state = { power: 150, cadence: 80, speed: 28, controlLog: [], trainer: null, click: null, timer: null };

  // ---- Rullo FTMS ----
  const ibd = new Char(0x2ad2, { notify: true });
  const cp = new Char(0x2ad9, { notify: true }, (bytes) => {
    state.controlLog.push(Array.from(bytes));
    setTimeout(() => cp.push([0x80, bytes[0], 0x01]), 5); // risposta "OK"
  });
  const feature = new Char(0x2acc, {}, null, () => {
    // fitness machine features (u32) + target setting features (u32): resistenza (bit 2), potenza (bit 3), simulazione (bit 13)
    const t = (1 << 2) | (1 << 3) | (1 << 13);
    return dv([0, 0, 0, 0, t & 0xff, (t >> 8) & 0xff, (t >> 16) & 0xff, (t >>> 24) & 0xff]);
  });
  const powerRange = new Char(0x2ad8, {}, null, () => dv([...u16(0), ...u16(600), ...u16(1)]));
  const status = new Char(0x2ada, { notify: true });
  const ftms = new Service(FTMS, [feature, powerRange, ibd, cp, status]);

  function sendBikeData() {
    // flags 0x0044: velocità presente (bit 0 = 0), cadenza (bit 2), potenza (bit 6)
    ibd.push([...u16(0x0044), ...u16(Math.round(state.speed * 100)), ...u16(Math.round(state.cadence * 2)), ...u16(Math.round(state.power))]);
  }

  // ---- Zwift Click ----
  const zAsync = new Char(Z_ASYNC, { notify: true });
  const zTx = new Char(Z_TX, { notify: true });
  const zRx = new Char(Z_RX, {}, (bytes) => {
    state.rideOn = (state.rideOn || 0) + 1;
    if (String.fromCharCode(...bytes.slice(0, 6)) === 'RideOn') setTimeout(() => zTx.push(Array.from(bytes)), 5);
  });
  const zwift = new Service(ZWIFT, [zAsync, zTx, zRx]);

  const RELEASED = 0x3ffff; // tutti i pulsanti a riposo (bit a 1)
  const rideMsg = (mask) => [0x23, 0x08, ...varint(mask)];

  const make = (kind) => {
    const mk = (id, name, svcs) => new Device(id, name, [...svcs, batSvc]);
    if (kind === 'click') { state.click = mk('fake-click', 'Zwift Click', [zwift]); return state.click; }
    if (kind === 'hr') return mk('fake-hr', 'Fake HRM', [hrSvc]);
    if (kind === 'csc') return mk('fake-csc', 'Fake RPM Sensor', [cscSvc]);
    if (kind === 'cps') return mk('fake-cps', 'Fake Power Pedals', [cpsSvc]);
    if (kind === 'cps-csc') return mk('fake-cpsc', 'Fake Power Meter', [cpsSvc, cscSvc]);
    // rullo "Zwift Ready": oltre a FTMS espone il servizio Zwift (cambio virtuale); resta un rullo, non un telecomando
    state.trainer = kind === 'trainer-zwift' ? mk('fake-trainer-z', 'Van Rysel D100 Zwift (finto)', [ftms, zwift]) : mk('fake-trainer', 'Van Rysel D100 (finto)', [ftms]);
    if (!state.timer) state.timer = setInterval(() => { if (state.trainer?.gatt.connected) { state.power += 0; sendBikeData(); } }, 250);
    return state.trainer;
  };

  window.__fakeBle = {
    state, make,
    setPower(w) { state.power = w; sendBikeData(); },
    setCadence(c) { state.cadence = c; },
    /** Preme e rilascia il pulsante "+" (bit 12) o "−" (bit 8) del Click v2. */
    async press(dir) {
      const bit = dir > 0 ? 12 : 8;
      zAsync.push(rideMsg(RELEASED));
      zAsync.push(rideMsg(RELEASED & ~(1 << bit)));
      zAsync.push(rideMsg(RELEASED));
    },
    /** Preme e rilascia un tasto qualsiasi del Click v2 per numero di bit (1 = Su, 3 = Giù, 0 = Sinistra, 2 = Destra, 4 = A, 5 = B). */
    async pressBit(bit) {
      zAsync.push(rideMsg(RELEASED));
      zAsync.push(rideMsg(RELEASED & ~(1 << bit)));
      zAsync.push(rideMsg(RELEASED));
    },
    /** Tiene premuto "+" / "−" (dir) per ms millisecondi, poi rilascia: pressione lunga. */
    async hold(dir, ms = 900) {
      const bit = dir > 0 ? 12 : 8;
      zAsync.push(rideMsg(RELEASED));
      zAsync.push(rideMsg(RELEASED & ~(1 << bit)));
      await new Promise((r) => setTimeout(r, ms));
      zAsync.push(rideMsg(RELEASED));
    },
    /** Prossimo dispositivo scelto nel selettore Bluetooth: 'trainer' (predefinito), 'click', 'hr', 'csc', 'cps', 'cps-csc'. */
    next: 'trainer',
    /** Elenco per navigator.bluetooth.getDevices() (ricollegamento all'avvio). */
    known: [],
    setHr(bpm) { hrChar.push([0, bpm]); },
    /** Pacchetto CSC: wheel = {revs, t}, crank = {revs, t} (tempo in 1/1024 s, 16 bit). */
    pushCsc({ wheel, crank }) {
      const flags = (wheel ? 1 : 0) | (crank ? 2 : 0);
      cscChar.push([flags, ...(wheel ? [...u32(wheel.revs), ...u16(wheel.t)] : []), ...(crank ? [...u16(crank.revs), ...u16(crank.t)] : [])]);
    },
    /** Pacchetto Cycling Power: watt e, se c'è crank = {revs, t}, i giri pedivella. */
    pushCps(power, crank) {
      cpsChar.push([...u16(crank ? 0x20 : 0), ...u16(power & 0xffff), ...(crank ? [...u16(crank.revs), ...u16(crank.t)] : [])]);
    },
    disconnectTrainer() { state.trainer?.gatt.disconnect(); },
  };

  navigator.bluetooth = {
    async getAvailability() { return true; },
    async getDevices() { return window.__fakeBle.known; },
    async requestDevice(opts = {}) {
      const f = opts.filters || [];
      const onlyZwift = f.length && f.every((x) => (x.namePrefix || '').startsWith('Zwift') || (x.services || []).includes(0xfc82));
      const kind = onlyZwift ? 'click' : window.__fakeBle.next || 'trainer';
      window.__fakeBle.next = 'trainer';
      return make(kind);
    },
  };
})();
