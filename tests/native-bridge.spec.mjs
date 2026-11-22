// Il ponte "navigator.bluetooth" dell'app Android (js/native.js) con un plugin BLE FINTO: nessun telefono, nessun browser.
// Ogni guasto del plugin deve diventare un errore "da Web Bluetooth" con un messaggio che js/connect.js sa spiegare,
// senza promesse appese, senza ascoltatori rimasti e senza collegamenti nativi lasciati aperti.
import { test, expect } from '@playwright/test';
import { createBluetooth, normalizeError } from '../js/native.js';
import { explainError } from '../js/connect.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

/** Plugin finto: `o` sceglie come fallisce ogni passo. Registra le chiamate in `calls`. */
function fakeBle(o = {}) {
  const calls = []; const listeners = new Map(); let inits = 0;
  const count = (name) => calls.filter((c) => c[0] === name).length;
  const plugin = {
    calls, listeners, count,
    async initialize(a) { inits++; calls.push(['initialize', a]); if (o.initialize) await o.initialize(inits); },
    async isEnabled() { calls.push(['isEnabled']); return { value: o.enabled !== false }; },
    async requestEnable() { calls.push(['requestEnable']); if (o.enableFails) throw new Error('requestEnable failed.'); o.enabled = true; },
    async requestDevice(req) { calls.push(['requestDevice', req]); if (o.requestDevice) return o.requestDevice(req); return { deviceId: 'AA:BB:CC:DD:EE:FF', name: 'Van Rysel D100' }; },
    async connect(a) { calls.push(['connect', a]); if (o.connect) await o.connect(); },
    async getServices(a) {
      calls.push(['getServices', a]);
      if (o.getServices) return o.getServices();
      return { services: [{ uuid: '00001826-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002ad2-0000-1000-8000-00805f9b34fb', properties: { notify: true } }] }] };
    },
    async disconnect(a) { calls.push(['disconnect', a]); },
    async startNotifications(a) { calls.push(['startNotifications', a]); if (o.startNotifications) await o.startNotifications(); },
    async stopNotifications(a) { calls.push(['stopNotifications', a]); },
    async addListener(ev, cb) { listeners.set(ev, cb); return { remove: async () => { listeners.delete(ev); } }; },
  };
  return plugin;
}
const setup = (o) => {
  const ble = fakeBle(o); const log = []; const crumbs = [];
  const { bluetooth } = createBluetooth(ble, { log: (m) => log.push(m), crumb: (m) => crumbs.push(m), storage: memory() });
  return { ble, bluetooth, log, crumbs };
};
const FTMS_REQ = { filters: [{ services: [0x1826] }], optionalServices: [0x1826] };

test('permesso negato: errore NotAllowedError spiegato come "permission", e al tentativo dopo si richiede di nuovo', async () => {
  const { ble, bluetooth, log } = setup({ initialize: (n) => { if (n === 1) throw new Error('Permission denied.'); } });
  const err = await bluetooth.requestDevice(FTMS_REQ).catch((e) => e);
  expect(err.name).toBe('NotAllowedError');
  expect(explainError(err)).toBe('permission');
  expect(ble.count('requestDevice')).toBe(0); // senza permesso non si apre nemmeno il selettore
  expect(log.some((l) => /initialize fallito/.test(l))).toBe(true);
  // la persona concede il permesso e riprova: il rifiuto non deve essere rimasto in memoria
  const dev = await bluetooth.requestDevice(FTMS_REQ);
  expect(dev.name).toBe('Van Rysel D100');
  expect(ble.count('initialize')).toBe(2);
});

test('la persona annulla il selettore: NotFoundError "cancelled", nessun dispositivo salvato', async () => {
  const { ble, bluetooth } = setup({ requestDevice: () => { throw new Error('requestDevice cancelled.'); } });
  const err = await bluetooth.requestDevice(FTMS_REQ).catch((e) => e);
  expect(err.name).toBe('NotFoundError');
  expect(explainError(err)).toBe('cancelled');
  expect(ble.count('requestDevice')).toBe(1);
  expect(await bluetooth.getDevices()).toEqual([]);
});

test('Bluetooth spento: si chiede di accenderlo; se la persona rifiuta, errore "off" e il selettore non si apre', async () => {
  const refused = setup({ enabled: false, enableFails: true });
  const err = await refused.bluetooth.requestDevice(FTMS_REQ).catch((e) => e);
  expect(err.name).toBe('InvalidStateError');
  expect(explainError(err)).toBe('off');
  expect(refused.ble.count('requestEnable')).toBe(1);
  expect(refused.ble.count('requestDevice')).toBe(0);

  const accepted = setup({ enabled: false });
  const dev = await accepted.bluetooth.requestDevice(FTMS_REQ);
  expect(dev.id).toBe('AA:BB:CC:DD:EE:FF');
  expect(accepted.ble.count('requestEnable')).toBe(1);
});

test('il plugin dice che lo scanner non c\'è (Bluetooth spento al volo): errore "off", non un selettore vuoto', async () => {
  const { bluetooth } = setup({ requestDevice: () => { throw new Error('Bluetooth is turned off or the BLE scanner is unavailable.'); } });
  const err = await bluetooth.requestDevice(FTMS_REQ).catch((e) => e);
  expect(err.name).toBe('InvalidStateError');
  expect(explainError(err)).toBe('off');
});

test('eccezione nativa trasformata in rifiuto dalla patch di Capacitor: messaggio chiaro, mai un crash', async () => {
  const { bluetooth } = setup({ requestDevice: () => { throw new Error('Native error in BluetoothLe.requestDevice (SecurityException: Need android.permission.BLUETOOTH_SCAN)'); } });
  const err = await bluetooth.requestDevice(FTMS_REQ).catch((e) => e);
  expect(err).toBeInstanceOf(DOMException);
  expect(err.message).toContain('SecurityException');
});

test('connect() fallisce: errore NetworkError, ascoltatore tolto, collegamento nativo rilasciato', async () => {
  const { ble, bluetooth, log } = setup({ connect: () => { throw new Error('Connection timeout.'); } });
  const dev = await bluetooth.requestDevice(FTMS_REQ);
  const err = await dev.gatt.connect().catch((e) => e);
  expect(err.name).toBe('NetworkError');
  expect(err.message).toMatch(/timeout/i);
  expect(dev.gatt.connected).toBe(false);
  expect(ble.listeners.has(`disconnected|${dev.id}`)).toBe(false);
  expect(ble.count('disconnect')).toBe(1);
  expect(log.some((l) => /connect fallito/.test(l))).toBe(true);
  expect(ble.count('getServices')).toBe(0);
});

test('getServices() fallisce: errore, collegamento nativo rilasciato, si può riprovare', async () => {
  let fail = true;
  const { ble, bluetooth } = setup({ getServices: () => { if (fail) throw new Error('Not connected to device.'); return { services: [] }; } });
  const dev = await bluetooth.requestDevice(FTMS_REQ);
  const err = await dev.gatt.connect().catch((e) => e);
  expect(err.name).toBe('NetworkError');
  expect(dev.gatt.connected).toBe(false);
  expect(ble.count('disconnect')).toBe(1);
  expect(ble.listeners.has(`disconnected|${dev.id}`)).toBe(false);
  fail = false;
  await dev.gatt.connect();
  expect(dev.gatt.connected).toBe(true);
});

test('disconnect() durante connect(): il collegamento è annullato, connect() rifiuta e il nativo viene chiuso', async () => {
  const gate = deferred();
  const { ble, bluetooth } = setup({ connect: () => gate.promise });
  const dev = await bluetooth.requestDevice(FTMS_REQ);
  const pending = dev.gatt.connect().catch((e) => e);
  await expect.poll(() => ble.count('connect')).toBe(1); // il connect nativo è partito e non è ancora finito
  dev.gatt.disconnect();
  gate.resolve(); // il nativo finisce comunque, ma la persona aveva già detto stop
  const err = await pending;
  expect(err.name).toBe('NetworkError');
  expect(err.message).toMatch(/abort/i);
  expect(dev.gatt.connected).toBe(false);
  expect(ble.count('getServices')).toBe(0); // niente servizi letti da un collegamento annullato
  expect(ble.count('disconnect')).toBeGreaterThanOrEqual(1);
  // e un nuovo connect() dopo l'annullamento funziona
  await dev.gatt.connect();
  expect(dev.gatt.connected).toBe(true);
});

test('collegamento riuscito: servizi, caratteristiche, notifiche; se startNotifications fallisce non resta l\'ascoltatore', async () => {
  const { ble, bluetooth, crumbs } = setup({});
  const dev = await bluetooth.requestDevice(FTMS_REQ);
  await dev.gatt.connect();
  expect(dev.gatt.connected).toBe(true);
  expect(crumbs.some((c) => /^connect /.test(c))).toBe(true); // i passi finiscono anche nelle briciole del registratore di crash
  const svc = await dev.gatt.getPrimaryService(0x1826);
  const ch = await svc.getCharacteristic(0x2ad2);
  let got = null;
  ch.addEventListener('characteristicvaluechanged', () => { got = [...new Uint8Array(ch.value.buffer)]; });
  await ch.startNotifications();
  ble.listeners.get(`notification|${dev.id}|${svc.uuid}|${ch.uuid}`)({ value: '01 02 ff' });
  expect(got).toEqual([1, 2, 255]);

  const bad = setup({ startNotifications: () => { throw new Error('Setting notification failed.'); } });
  const d2 = await bad.bluetooth.requestDevice(FTMS_REQ); await d2.gatt.connect();
  const c2 = await (await d2.gatt.getPrimaryService(0x1826)).getCharacteristic(0x2ad2);
  await expect(c2.startNotifications()).rejects.toMatchObject({ name: 'NetworkError' });
  expect(bad.ble.listeners.size).toBe(1); // resta solo quello di "disconnected", nessun ascoltatore di notifiche orfano
});

test('normalizeError: ogni messaggio noto del plugin ha il suo nome', () => {
  const name = (m) => normalizeError(new Error(m)).name;
  expect(name('Permission denied.')).toBe('NotAllowedError');
  expect(name('requestDevice cancelled.')).toBe('NotFoundError');
  expect(name('Bluetooth is turned off or the BLE scanner is unavailable.')).toBe('InvalidStateError');
  expect(name('Connection timeout.')).toBe('NetworkError');
  expect(name('Not connected to device.')).toBe('NetworkError');
  expect(name('qualcosa di strano')).toBe('NetworkError');
  const dom = new DOMException('x', 'AbortError');
  expect(normalizeError(dom)).toBe(dom);
});
