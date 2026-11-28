// Integrazione con l'app Android (Capacitor). Nel browser non fa nulla.
// Nell'app: Web Bluetooth non esiste nella WebView, quindi qui si installa un "navigator.bluetooth"
// equivalente costruito sul plugin nativo @capacitor-community/bluetooth-le. Il resto dell'app
// (rullo, Zwift Click, cardio, misuratore di potenza) funziona senza modifiche.
// Ogni errore del plugin esce come eccezione "da Web Bluetooth" (NotAllowedError, NotFoundError, NetworkError, InvalidStateError)
// con un messaggio chiaro, così js/connect.js (explainError) lo spiega alla persona; niente promesse che restano appese.
const cx = globalThis.window?.capacitorExports;
export const isNative = !!cx?.Capacitor?.isNativePlatform?.();
export const BLE = isNative ? cx.registerPlugin('BluetoothLe') : null;
export const GarminBridge = isNative ? cx.registerPlugin('GarminBridge') : null;
// promemoria dei piani di allenamento (@capacitor/local-notifications): notifiche locali, nessun server
export const LocalNotifications = isNative ? cx.registerPlugin('LocalNotifications') : null;

// Diario del collegamento: va nel registro dell'app (setNativeLogger) e, nell'app Android, anche nelle "briciole" del
// registratore di crash (GarminBridge.breadcrumb): se il processo muore subito dopo, l'ultimo passo resta nel report.
let sink = null;
export const setNativeLogger = (fn) => { sink = typeof fn === 'function' ? fn : null; };
export function nativeLog(msg) {
  try { sink?.(`BLE · ${msg}`); } catch { /* il log non deve mai rompere il collegamento */ }
}
const defaultCrumb = (msg) => { try { GarminBridge?.breadcrumb?.({ message: msg })?.catch?.(() => {}); } catch { /* plugin vecchio */ } };

const ALIASES = {
  heart_rate: 0x180d, battery_service: 0x180f, device_information: 0x180a, cycling_power: 0x1818,
  cycling_speed_and_cadence: 0x1816, fitness_machine: 0x1826, heart_rate_measurement: 0x2a37,
};
export function uuid(u) {
  if (typeof u === 'number') return `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
  if (ALIASES[u]) return uuid(ALIASES[u]);
  const s = String(u).toLowerCase();
  if (/^[0-9a-f]{4}$/.test(s)) return uuid(parseInt(s, 16));
  return s;
}
const hexToDV = (hex) => {
  const pairs = String(hex || '').replace(/[^0-9a-f]/gi, '').match(/../g) || [];
  return new DataView(new Uint8Array(pairs.map((h) => parseInt(h, 16))).buffer);
};
const toHex = (v) => {
  const u8 = v instanceof DataView ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
    : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer || v);
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join(' ');
};

/** Dal messaggio del plugin (o di Capacitor) a un errore "da Web Bluetooth" con un messaggio che connect.js sa spiegare. */
export function normalizeError(err, fallbackName = 'NetworkError') {
  if (err instanceof DOMException) return err;
  const raw = String(err?.message ?? err ?? 'unknown error');
  const make = (name, msg) => { const e = new DOMException(msg, name); e.cause = err; e.pluginMessage = raw; return e; };
  if ((/permission/i.test(raw) && /den|revok|missing|not granted/i.test(raw)) || /SecurityException/.test(raw)) return make('NotAllowedError', `Bluetooth permission denied (${raw})`);
  if (/cancel/i.test(raw)) return make('NotFoundError', 'User cancelled the device picker');
  if (/turned off|not enabled|is disabled|scanner is unavailable|not available|requestEnable failed/i.test(raw)) return make('InvalidStateError', `Bluetooth is turned off (${raw})`);
  if (/timeout|timed out/i.test(raw)) return make('NetworkError', `Bluetooth timeout (${raw})`);
  if (/not connected|disconnected/i.test(raw)) return make('NetworkError', `GATT server disconnected (${raw})`);
  if (/Native error in/i.test(raw)) return make('NetworkError', `The Bluetooth plugin failed (${raw})`); // eccezione nativa trasformata in rifiuto dalla patch di Capacitor
  return make(fallbackName, raw);
}

/**
 * Costruisce l'oggetto "navigator.bluetooth" sopra il plugin `BLE` (nei test: un plugin finto).
 * opts: { log(msg), crumb(msg), storage }. Niente di qui tocca `window`.
 */
export function createBluetooth(BLE, { log = nativeLog, crumb = defaultCrumb, storage = globalThis.localStorage } = {}) {
  // le operazioni GATT vanno fatte una alla volta
  let queue = Promise.resolve();
  const serial = (fn) => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p.catch((e) => { throw normalizeError(e); });
  };
  const step = (msg) => { log(msg); crumb(msg); };

  // initialize() chiede i permessi Bluetooth. Un rifiuto NON va ricordato: dopo "Consenti" in Impostazioni (o con un secondo tocco)
  // si deve poter riprovare senza riavviare l'app.
  let ready = null;
  const init = () => (ready ||= (async () => {
    step('initialize (permessi Bluetooth)');
    try { await BLE.initialize({ androidNeverForLocation: true }); } catch (e) {
      ready = null; step(`initialize fallito: ${e?.message || e}`);
      throw normalizeError(e, 'NotAllowedError');
    }
  })());
  // Bluetooth spento: senza questo il selettore del plugin restava aperto senza trovare nulla
  // `silent`: tentativo in sottofondo (ricollegamento automatico): niente richiesta di accensione, solo un errore che nessuno vede
  const ensureEnabled = async ({ silent = false } = {}) => {
    let on = true;
    try { on = (await BLE.isEnabled())?.value !== false; } catch { /* non si sa: si prova comunque */ }
    if (on) return;
    if (silent) throw new DOMException('Bluetooth is turned off', 'InvalidStateError');
    step('Bluetooth spento: richiesta di accensione');
    try { await BLE.requestEnable(); } catch (e) {
      step(`accensione rifiutata: ${e?.message || e}`);
      throw new DOMException('Bluetooth is turned off', 'InvalidStateError');
    }
  };

  class NativeCharacteristic extends EventTarget {
    constructor(device, service, info) {
      super();
      this.service = service; this.uuid = info.uuid; this._dev = device; this.value = null;
      const p = info.properties || {};
      this.properties = { read: !!p.read, write: !!p.write, writeWithoutResponse: !!p.writeWithoutResponse, notify: !!p.notify, indicate: !!p.indicate };
    }
    get _ids() { return { deviceId: this._dev.id, service: this.service.uuid, characteristic: this.uuid }; }
    async readValue() { const r = await serial(() => BLE.read(this._ids)); this.value = hexToDV(r.value); return this.value; }
    writeValueWithResponse(v) { return serial(() => BLE.write({ ...this._ids, value: toHex(v) })); }
    writeValueWithoutResponse(v) { return serial(() => BLE.writeWithoutResponse({ ...this._ids, value: toHex(v) })); }
    writeValue(v) { return this.writeValueWithResponse(v); }
    async startNotifications() {
      const key = `notification|${this._dev.id}|${this.service.uuid}|${this.uuid}`;
      await this._listener?.remove();
      this._listener = await BLE.addListener(key, (ev) => {
        this.value = hexToDV(ev.value);
        this.dispatchEvent(new Event('characteristicvaluechanged'));
      });
      try { await serial(() => BLE.startNotifications(this._ids)); } catch (e) {
        await this._listener?.remove(); this._listener = null; // niente ascoltatori orfani se la sottoscrizione non è partita
        throw e;
      }
      return this;
    }
    async stopNotifications() { await this._listener?.remove(); await serial(() => BLE.stopNotifications(this._ids)); return this; }
  }

  class NativeService {
    constructor(device, info) { this.device = device; this.uuid = info.uuid; this.chars = (info.characteristics || []).map((c) => new NativeCharacteristic(device, this, c)); }
    async getCharacteristic(u) { const id = uuid(u); const c = this.chars.find((x) => x.uuid === id); if (!c) throw new DOMException('Characteristic not found', 'NotFoundError'); return c; }
    async getCharacteristics() { return this.chars; }
  }

  class NativeDevice extends EventTarget {
    constructor(id, name) {
      super();
      this.id = id; this.name = name; this.services = [];
      const dev = this;
      // "Dimentica": l'app non lo ricollega più (getDevices() lo elenca da qui)
      this.forget = async () => { try { storage?.setItem('nativeDevices', JSON.stringify(JSON.parse(storage.getItem('nativeDevices') || '[]').filter((x) => x.id !== id))); } catch { /* niente storage */ } };
      let attempt = 0; // ogni connect() ha un numero: un disconnect() arrivato nel frattempo lo annulla
      let cancelledAt = 0;
      const release = async () => { // rilascia ascoltatore e connessione nativa dopo un collegamento fallito o annullato
        try { await dev._disc?.remove(); } catch { /* già tolto */ }
        dev._disc = null;
        try { await BLE.disconnect({ deviceId: id }); } catch { /* non era collegato */ }
      };
      this.gatt = {
        connected: false, device: dev,
        // opts (solo dal ricollegamento automatico): { timeout } tempo massimo del plugin per questo tentativo (predefinito 10 s),
        // { silent } niente richiesta di accendere il Bluetooth. Web Bluetooth non ha argomenti: il browser li ignorerebbe.
        async connect(opts = {}) {
          const mine = ++attempt;
          const silent = !!opts?.silent;
          const timeout = Number(opts?.timeout) > 0 ? Number(opts.timeout) : 0;
          const aborted = () => cancelledAt >= mine;
          step(`connect ${id}`);
          try {
            await init();
            await ensureEnabled({ silent });
            await dev._disc?.remove();
            dev._disc = await BLE.addListener(`disconnected|${id}`, () => { dev.gatt.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); });
            await serial(() => BLE.connect(timeout ? { deviceId: id, timeout } : { deviceId: id }));
            if (aborted()) throw new DOMException('GATT connection aborted by disconnect()', 'NetworkError');
            step(`collegato ${id}: lettura servizi`);
            let res = await serial(() => BLE.getServices({ deviceId: id }));
            if (aborted()) throw new DOMException('GATT connection aborted by disconnect()', 'NetworkError');
            // Android sometimes connects and then reports NO services (a stale GATT cache on the phone, or a discovery that ended
            // too early): the trainer then looked "not supported" although it is an ordinary FTMS trainer (two reports from
            // Pixel phones, Wahoo KICKR CORE and Van Rysel). Clear the cache and search again, twice at most.
            for (let k = 0; k < 2 && !(res?.services || []).length && typeof BLE.discoverServices === 'function'; k++) {
              step(`collegato ${id}: nessun servizio, nuova ricerca (${k + 1})`);
              await new Promise((r) => setTimeout(r, 400 + 600 * k));
              try { await serial(() => BLE.discoverServices({ deviceId: id })); } catch (e) { step(`discoverServices fallito: ${normalizeError(e).message}`); }
              if (aborted()) throw new DOMException('GATT connection aborted by disconnect()', 'NetworkError');
              res = await serial(() => BLE.getServices({ deviceId: id }));
            }
            dev.services = (res?.services || []).map((s) => new NativeService(dev, s));
            this.connected = true;
            step(`pronto ${id}: ${dev.services.length} servizi`);
            return this;
          } catch (e) {
            const err = normalizeError(e);
            step(`connect fallito (${err.name}): ${err.message}`);
            this.connected = false;
            await release();
            throw err;
          }
        },
        disconnect() {
          cancelledAt = attempt; // annulla un connect() ancora in corso
          this.connected = false;
          Promise.resolve().then(() => BLE.disconnect({ deviceId: id })).catch(() => {});
        },
        async getPrimaryService(u) { const want = uuid(u); const s = dev.services.find((x) => x.uuid === want); if (!s) throw new DOMException('Service not found', 'NotFoundError'); return s; },
        async getPrimaryServices() { return dev.services; },
      };
    }
  }

  const bluetooth = {
    async getAvailability() { return true; },
    // dispositivi già scelti in passato (id e nome salvati qui): l'app prova a ricollegarli all'avvio, senza aprire la scelta
    async getDevices() {
      try { return (JSON.parse(storage?.getItem('nativeDevices') || '[]')).map((d) => new NativeDevice(d.id, d.name)); } catch { return []; }
    },
    async requestDevice(opts = {}) {
      await init();
      await ensureEnabled();
      const services = []; let namePrefix = null;
      for (const f of opts.filters || []) {
        if (f.services) services.push(...f.services.map(uuid));
        if (f.namePrefix && !namePrefix) namePrefix = f.namePrefix;
      }
      const req = services.length ? { services: [...new Set(services)] } : namePrefix ? { namePrefix } : {};
      req.optionalServices = (opts.optionalServices || []).map(uuid);
      step('requestDevice: selettore dei dispositivi');
      let d;
      try { d = await BLE.requestDevice(req); } catch (e) {
        const err = normalizeError(e, 'NotFoundError');
        step(`requestDevice: ${err.name}: ${err.message}`);
        throw err;
      }
      if (!d?.deviceId) throw new DOMException('No device selected', 'NotFoundError');
      step(`scelto: ${d.name || 'Device'}`);
      try {
        const list = JSON.parse(storage.getItem('nativeDevices') || '[]').filter((x) => x.id !== d.deviceId);
        list.unshift({ id: d.deviceId, name: d.name || 'Device' });
        storage.setItem('nativeDevices', JSON.stringify(list.slice(0, 8)));
      } catch { /* niente storage */ }
      return new NativeDevice(d.deviceId, d.name || 'Device');
    },
  };
  return { bluetooth, NativeDevice };
}

if (isNative) {
  const { bluetooth } = createBluetooth(BLE);
  Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true });
  document.documentElement.classList.add('native-app');
}
