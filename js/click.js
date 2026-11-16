// Supporto SPERIMENTALE per i telecomandi Zwift: Click (v1 e v2), Play (sinistro + destro) e Ride.
// Protocollo "Zwift Connect" ricostruito da progetti open source (da confrontare con i sorgenti):
//  - ajchellew/zwiftplay (https://github.com/ajchellew/zwiftplay): UUID, handshake, messaggi Play
//  - SwiftControl (https://github.com/jonasbark/swiftcontrol): Click v2 / Ride / Play, tabella dei tasti
//  - qdomyos-zwift (https://github.com/cagnulein/qdomyos-zwift): zwiftclickremote / zwiftplayremote
// Handshake "RideOn", poi messaggi [tipo][protobuf]. I pulsanti sono "attivi bassi": 0 = premuto.
//  0x37 Click v1      campo 1 = +, campo 2 = −
//  0x23 Click v2/Ride campo 1 = maschera di bit (bit a 0 = premuto)
//  0x07 Play          campo 1 = lato (non è un tasto), 2..5 = Y/Su, Z/Sinistra, A/Destra, B/Giù,
//                     6 = tasto Zwift (On), 7 = leva cambio (Shift)  [ordine come in ajchellew/zwiftplay]
//  0x19 batteria, 0x15 keep-alive
// NON implementato (serve un dispositivo vero per verificarlo): lo scambio di chiavi cifrato che alcuni
// firmware di Play/Ride richiedono. Vedi docs/zwift-controller.md.

import { SensorDebug, hex } from './debug.js';
import { listen } from './ble-util.js';

const SERVICES = ['00000001-19ca-4651-86e5-fa29dcdd09d1', 0xfc82];
const ASYNC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
const SYNC_RX = '00000003-19ca-4651-86e5-fa29dcdd09d1';
const SYNC_TX = '00000004-19ca-4651-86e5-fa29dcdd09d1';
export const RIDE_ON = [0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e];

// Modelli riconosciuti. Il nome BLE è "Zwift Click", "Zwift Play …", "Zwift Ride …".
export const MODELS = { click: 'Zwift Click', play: 'Zwift Play', ride: 'Zwift Ride' };
export function detectModel(name = '') {
  if (/ride/i.test(name)) return 'ride';
  if (/play/i.test(name)) return 'play';
  return 'click'; // anche nome mancante/sconosciuto: comportamento di sempre
}

const MSG = { CLICK: 0x37, RIDE: 0x23, PLAY: 0x07, BATTERY: 0x19, KEEPALIVE: 0x15, INFO: 0x2a, SYSTEM: 0xff };
// bit dei pulsanti noti: a riposo valgono 1, quindi un bit noto a 0 = premuto fin dal primo pacchetto
const KNOWN_RIDE_BITS = 0x37fff;

// Nomi noti dei bit del protocollo "Ride"
export const RIDE_BITS = {
  0: 'Left', 1: 'Up', 2: 'Right', 3: 'Down', 4: 'A', 5: 'B', 6: 'Y', 7: 'X', 8: 'Click v2 − (Z)',
  9: 'Shift up (L)', 10: 'Shift down (L)', 11: 'Power-up (L)', 12: 'Click v2 + (On/Off L)',
  13: 'Shift up (R)', 14: 'Shift down (R)', 16: 'Power-up (R)', 17: 'On/Off (R)',
};
const PLAY_FIELDS = { 2: 'Y/Up', 3: 'Z/Left', 4: 'A/Right', 5: 'B/Down', 6: 'Zwift button', 7: 'Shift lever' };

// ---- Ruoli ----
// Ogni id grezzo ("ride:12") ha un RUOLO. Tutta l'app ragiona per ruoli, mai per id grezzi:
//   plus / minus: cambio (o + / − nei menu) · up / down / left / right: frecce · ok / back: A e B · menu: apre il menu Click
// Click v2 (verificato su un Click del D100 Zwift Ready): SOLO + = bit 12 e − = bit 8. Tutto il resto è DA VERIFICARE
// (nomi dei bit dalla tabella di SwiftControl): la "Verifica tasti" (js/clickcheck.js) serve a impararli.
export const ROLES = ['plus', 'minus', 'up', 'down', 'left', 'right', 'ok', 'back', 'menu'];
export const DEFAULT_ROLES = {
  'v1:1': 'plus', 'v1:2': 'minus',
  // Click v2: croce 0..3, A/B 4..5, − = 8, + = 12; le leve di cambio (9, 10, 13, 14) esistono solo sul Ride ma restano come prima
  'ride:12': 'plus', 'ride:8': 'minus',
  'ride:1': 'up', 'ride:3': 'down', 'ride:0': 'left', 'ride:2': 'right', 'ride:4': 'ok', 'ride:5': 'back',
  'ride:9': 'plus', 'ride:10': 'minus', 'ride:13': 'plus', 'ride:14': 'minus',
  // Play (sx e dx mandano gli stessi campi): Y/Su, Z/Sinistra, A/Destra, B/Giù; tasto Zwift = menu
  'play:2': 'up', 'play:3': 'left', 'play:4': 'right', 'play:5': 'down', 'play:6': 'menu',
  // Ride ("zr"): leve di cambio come +/−, croce come frecce; A/B/Y/Z cambiano marcia come sempre (finché non li impari)
  'zr:9': 'plus', 'zr:10': 'minus', 'zr:13': 'plus', 'zr:14': 'minus',
  'zr:1': 'up', 'zr:3': 'down', 'zr:2': 'right', 'zr:0': 'left', 'zr:4': 'plus', 'zr:5': 'minus', 'zr:6': 'plus', 'zr:7': 'minus',
  'zr:12': 'menu', 'zr:17': 'menu',
};
// Cambio di marcia / direzione nel gioco di ogni ruolo (Su = marcia più dura, Destra = +)
export const SHIFT = { plus: 1, minus: -1, up: 1, down: -1, right: 1, left: -1 };
// Tasti "di cambio" (leve): mai tolti agli altri quando si impara un ruolo
const PADDLES = new Set(['ride:9', 'ride:10', 'ride:13', 'ride:14', 'zr:9', 'zr:10', 'zr:13', 'zr:14']);
// Mappa vecchia (clickMap della pagina di debug, id → ±1) come era prima dei ruoli: serve a migrarne solo le modifiche
const LEGACY_DEFAULT = {
  'v1:1': +1, 'v1:2': -1, 'ride:12': +1, 'ride:8': -1, 'ride:1': +1, 'ride:3': -1, 'ride:9': +1, 'ride:10': -1, 'ride:13': +1, 'ride:14': -1,
  'play:2': +1, 'play:5': -1, 'play:4': +1, 'play:3': -1,
  'zr:9': +1, 'zr:10': -1, 'zr:13': +1, 'zr:14': -1, 'zr:1': +1, 'zr:3': -1, 'zr:2': +1, 'zr:0': -1, 'zr:4': +1, 'zr:5': -1, 'zr:6': +1, 'zr:7': -1,
};
const protoOf = (id) => id.split(':')[0];
// Famiglia di dispositivo di un id: v1, v2 (id "ride:"), play, ride (id "zr:")
export const KIND_OF_PROTO = { v1: 'v1', ride: 'v2', play: 'play', zr: 'ride' };
export const KIND_NAMES = { v1: 'Zwift Click v1', v2: 'Zwift Click v2', play: 'Zwift Play', ride: 'Zwift Ride' };

// id con un nome nelle tabelle (anche se senza ruolo): non sono "sconosciuti"
const KNOWN_NAMES = {};
for (const n of Object.keys(RIDE_BITS)) { KNOWN_NAMES[`ride:${n}`] = 1; KNOWN_NAMES[`zr:${n}`] = 1; }
for (const n of Object.keys(PLAY_FIELDS)) KNOWN_NAMES[`play:${n}`] = 1;
KNOWN_NAMES['v1:1'] = KNOWN_NAMES['v1:2'] = 1;

export function buttonLabel(id) {
  const [proto, n] = id.split(':');
  if (proto === 'v1') return n === '1' ? 'Click +' : n === '2' ? 'Click −' : `Click campo ${n}`;
  if (proto === 'ride' || proto === 'zr') return `${RIDE_BITS[n] || 'Bit'} (bit ${n})`;
  if (proto === 'play') return `${PLAY_FIELDS[n] || 'Campo'} (campo ${n})`;
  return id;
}

export class ZwiftClick extends EventTarget {
  constructor() {
    super();
    this.links = []; // un elemento per dispositivo collegato (Click: 1, Play: fino a 2, Ride: 1)
    this.pressed = new Set(); // unione dei tasti premuti su tutti i dispositivi
    this.dbg = new SensorDebug('click', 'Zwift Click');
    this.dbg.extra = { pressed: [], lastPressed: null, battery: null, protocol: null };
    this.unknownIds = new Set(); // id grezzi mai visti nella tabella dei ruoli (per la verifica tasti e il rapporto)
    this.loadRoles();
  }

  // ---- Ruoli: id grezzo → ruolo (predefiniti + imparati dall'utente, salvati per famiglia di dispositivo) ----
  loadRoles() {
    this.store = {}; // { v2: { roles: { 'ride:12': 'minus', 'ride:3': null }, confirmed: true } }
    try { this.store = JSON.parse(localStorage.getItem('clickRoles') || '{}') || {}; } catch { this.store = {}; }
    // migrazione della vecchia mappa di debug: solo le voci che differivano dai predefiniti di allora
    try {
      const old = JSON.parse(localStorage.getItem('clickMap') || 'null');
      if (old && !this.store._migrated) {
        for (const [id, dir] of Object.entries(old)) if (LEGACY_DEFAULT[id] !== dir) this.setRole(id, dir > 0 ? 'plus' : dir < 0 ? 'minus' : null, false);
        this.store._migrated = 1; this.saveRoles();
      }
    } catch { /* niente storage */ }
    this.rebuild();
  }
  saveRoles() { try { localStorage.setItem('clickRoles', JSON.stringify(this.store)); } catch { /* niente storage */ } }
  rebuild() {
    this.roles = { ...DEFAULT_ROLES };
    for (const k of Object.keys(this.store)) {
      if (k.startsWith('_')) continue;
      for (const [id, r] of Object.entries(this.store[k].roles || {})) { if (r) this.roles[id] = r; else delete this.roles[id]; }
    }
  }
  /** Ruolo di un id grezzo (null = nessuno / sconosciuto). */
  roleOf(id) { return this.roles[id] || null; }
  /** Id che hanno un ruolo (predefinito o imparato), per le famiglie indicate (default: quelle collegate). */
  idsOf(role, kinds = this.kinds) {
    const protos = new Set(Object.entries(KIND_OF_PROTO).filter(([, k]) => kinds.includes(k)).map(([p]) => p));
    return Object.entries(this.roles).filter(([id, r]) => r === role && protos.has(protoOf(id))).map(([id]) => id);
  }
  /** Assegna (o toglie, role = null) un ruolo a un id. Impara = toglie lo stesso ruolo agli altri tasti principali della famiglia. */
  setRole(id, role, save = true, learned = false) {
    const proto = protoOf(id); const fam = (this.store[proto] ||= { roles: {} });
    if (role) {
      for (const [other, r] of Object.entries(this.roles || DEFAULT_ROLES)) {
        if (r === role && other !== id && protoOf(other) === proto && !PADDLES.has(other) && role !== 'menu') fam.roles[other] = null;
      }
      fam.roles[id] = role;
    } else fam.roles[id] = null;
    if (learned) fam.learned = { ...(fam.learned || {}), [role]: id };
    if (save) { this.saveRoles(); this.rebuild(); }
    else this.roles = { ...(this.roles || DEFAULT_ROLES), ...(role ? { [id]: role } : {}) };
  }
  /** Dalla verifica tasti: il tasto con questo id fa questo ruolo. */
  learn(id, role) {
    this.setRole(id, role, true, true);
    this.dbg.log(`Learned ${buttonLabel(id)} (${id}) as "${role}"`);
    this.emit('rolechange');
  }
  /** L'utente ha concluso la verifica tasti per questa famiglia: la mappatura è "confermata". */
  confirm(kind) {
    const proto = Object.keys(KIND_OF_PROTO).find((p) => KIND_OF_PROTO[p] === kind); if (!proto) return;
    (this.store[proto] ||= { roles: {} }).confirmed = true; this.saveRoles(); this.emit('rolechange');
  }
  isConfirmed(kind) { const proto = Object.keys(KIND_OF_PROTO).find((p) => KIND_OF_PROTO[p] === kind); return !!this.store[proto]?.confirmed; }
  /** Per la pagina di debug: "usa come + / − / nessuna azione" sopra i ruoli. */
  assign(id, dir) {
    this.setRole(id, dir > 0 ? 'plus' : dir < 0 ? 'minus' : null);
    this.dbg.log(`${buttonLabel(id)} assigned to ${dir > 0 ? '+' : dir < 0 ? '−' : 'no action'}`);
  }
  resetMap(kind = null) {
    if (!kind) this.store = {};
    else { const proto = Object.keys(KIND_OF_PROTO).find((p) => KIND_OF_PROTO[p] === kind); delete this.store[proto]; }
    try { localStorage.removeItem('clickMap'); } catch { /* niente storage */ }
    this.store._migrated = 1; this.saveRoles(); this.rebuild();
    this.dbg.log('Button assignments reset');
    this.emit('rolechange');
  }
  /** Famiglie collegate di cui si conosce il tipo ('v1' | 'v2' | 'play' | 'ride'); un Click ancora muto non c'è. */
  get kinds() { return [...new Set(this.links.filter((l) => l.device?.gatt?.connected && l.kind).map((l) => l.kind))]; }
  get kind() { return this.kinds[0] || null; }
  /** Cosa può fare ciò che è collegato (secondo i ruoli attuali): per la legenda e per il modello di navigazione. */
  get caps() {
    const kinds = this.kinds.length ? this.kinds : (this.connected ? ['v1'] : []); // un Click che non ha ancora mandato nulla: finché non si sa, due tasti
    const c = {}; for (const r of ROLES) c[r] = this.idsOf(r, kinds).length > 0;
    c.arrows = c.up || c.down || c.left || c.right;
    c.plusMinus = c.plus && c.minus;
    return c;
  }
  /** Id grezzi per cui esiste un ruolo di default o imparato, per famiglia: ciò che la verifica può mostrare. */
  /** Dati per il rapporto "Copia rapporto". */
  reportData() {
    const kinds = this.kinds; const rows = {};
    for (const r of ROLES) { const ids = this.idsOf(r, kinds); if (ids.length) rows[r] = ids; }
    const learned = {}; for (const k of kinds) { const p = Object.keys(KIND_OF_PROTO).find((x) => KIND_OF_PROTO[x] === k); if (this.store[p]?.learned) Object.assign(learned, this.store[p].learned); }
    return { kinds, rows, learned, unknown: [...this.unknownIds], types: [...new Set(this.links.flatMap((l) => [...(l.types || [])]))], confirmed: kinds.length > 0 && kinds.every((k) => this.isConfirmed(k)) };
  }

  get device() { return this.links[0]?.device || null; }
  get connected() { return this.links.some((l) => l.device?.gatt?.connected); }
  /** Modelli collegati, es. ['play', 'play'] */
  get models() { return this.links.filter((l) => l.device?.gatt?.connected).map((l) => l.model); }
  /** Testo per la UI: "Zwift Click", "Zwift Play", "Zwift Play ×2", "Zwift Ride" */
  get label() {
    const m = this.models; if (!m.length) return '';
    const counts = {}; for (const k of m) counts[k] = (counts[k] || 0) + 1;
    return Object.entries(counts).map(([k, n]) => MODELS[k] + (n > 1 ? ` ×${n}` : '')).join(' + ');
  }
  /** I Play sono due controller (sinistro e destro): dopo il primo se ne può aggiungere un secondo. */
  get canAddSecond() { return this.models.length === 1 && this.models[0] === 'play'; }

  async connect(picked) {
    const device = picked || await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Zwift' }, { services: [0xfc82] }],
      optionalServices: [...SERVICES, 'battery_service', 'device_information'],
    });
    if (this.links.some((l) => l.device.id === device.id && l.device.gatt?.connected)) throw new Error('Device already connected');
    const link = { device, rx: null, model: detectModel(device.name), kind: null, types: new Set(), pressed: new Set(), seenHigh: KNOWN_RIDE_BITS, unknown: 0 };
    this.dbg.setStatus(`Connecting ${device.name || ''}…`);
    this.dbg.log(`Model recognized from name "${device.name || ''}": ${MODELS[link.model]}`);
    listen(this, `disc|${device.id}`, device, 'gattserverdisconnected', () => {
      this.dbg.setStatus(`Disconnected ${MODELS[link.model]}`);
      this.links = this.links.filter((l) => l !== link);
      this.recompute(); // rilascia i tasti di questo dispositivo
      this.emit('disconnected');
    });
    this.links.push(link);
    try {
      const server = await device.gatt.connect();
      await this.dbg.describe(device, server);

      let service = null;
      for (const uuid of SERVICES) {
        try { service = await server.getPrimaryService(uuid); this.dbg.log(`Zwift service found: ${service.uuid}`); break; } catch { /* prova il prossimo */ }
      }
      if (!service) throw new Error('Zwift service not found on the device');

      for (const uuid of [ASYNC, SYNC_TX]) {
        try {
          const c = await service.getCharacteristic(uuid);
          listen(this, `ch|${device.id}|${uuid}`, c, 'characteristicvaluechanged', (e) => this.onMessage(uuid, e.target.value, link));
          await c.startNotifications();
          this.dbg.log(`Notifications on for ${uuid.slice(0, 8)}`);
        } catch (err) {
          this.dbg.log(`Notifications NOT on for ${uuid.slice(0, 8)}: ${err.message}`);
        }
      }
      link.rx = await service.getCharacteristic(SYNC_RX);
      await this.writeLink(link, RIDE_ON);
    } catch (err) {
      this.links = this.links.filter((l) => l !== link);
      try { device.gatt.disconnect(); } catch { /* già scollegato */ }
      throw err;
    }
    this.dbg.setStatus(`Connected ${MODELS[link.model]}, handshake sent`);
    this.dbg.extra.devices = this.links.map((l) => `${MODELS[l.model]} (${l.device.name || '?'})`);
    this.emit('connected', { model: link.model });
    return this.label || device.name || 'Zwift Click';
  }

  async writeLink(link, bytes) {
    if (!link.rx) throw new Error('Click not connected');
    const data = new Uint8Array(bytes);
    this.dbg.raw('tx', SYNC_RX, data);
    await link.rx.writeValueWithResponse(data);
  }

  /** Scrive su tutti i dispositivi collegati (usato dalla pagina di debug). */
  async write(bytes) {
    const ls = this.links.filter((l) => l.rx);
    if (!ls.length) throw new Error('Click not connected');
    for (const l of ls) await this.writeLink(l, bytes);
  }

  disconnect() { for (const l of [...this.links]) if (l.device?.gatt?.connected) l.device.gatt.disconnect(); }

  onMessage(uuid, value, link = this.links[0]) {
    this.dbg.raw('rx', uuid, value);
    if (!link) return;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)) === 'RideOn') {
      this.dbg.log(`RideOn handshake response (${bytes.length} bytes${bytes.length > 6 ? ': probably needs encryption → ' + hex(bytes.subarray(6)) : ''})`);
      this.dbg.extra.handshake = bytes.length > 6 ? 'RideOn + data' : 'RideOn';
      return;
    }
    const type = bytes[0];
    link.types.add(`0x${type.toString(16).padStart(2, '0')}`);
    const fields = parseFields(bytes.subarray(1));
    let pressed = null;
    const label = MODELS[link.model];

    if (type === MSG.CLICK) {
      this.dbg.extra.protocol = 'Click v1 (0x37)';
      this.setKind(link, 'v1');
      pressed = new Set();
      for (const [f, v] of Object.entries(fields)) if (v === 0) pressed.add(`v1:${f}`);
    } else if (type === MSG.RIDE) {
      this.dbg.extra.protocol = `${label} (0x23)`;
      const proto = link.model === 'ride' ? 'zr' : 'ride'; // Click v2 mantiene gli id di sempre
      this.setKind(link, KIND_OF_PROTO[proto]);
      const mask = fields[1];
      if (typeof mask === 'number') {
        link.seenHigh |= mask;
        pressed = new Set();
        for (let bit = 0; bit < 32; bit++) {
          if ((link.seenHigh >>> bit) & 1 && !((mask >>> bit) & 1)) pressed.add(`${proto}:${bit}`);
        }
        this.dbg.extra.mask = `0x${(mask >>> 0).toString(16)} (${(mask >>> 0).toString(2).padStart(18, '0')})`;
      }
    } else if (type === MSG.PLAY) {
      if (link.model !== 'play') { this.dbg.log(`Play message (0x07) from "${link.device.name}": model corrected to Zwift Play`); link.model = 'play'; }
      this.dbg.extra.protocol = 'Play (0x07)';
      this.setKind(link, 'play');
      pressed = new Set();
      // campo 1 = lato del controller (non è un tasto); 8-9 = leve analogiche, ignorate
      for (const [f, v] of Object.entries(fields)) if (Number(f) >= 2 && Number(f) <= 7 && v === 0) pressed.add(`play:${f}`);
    } else if (type === MSG.BATTERY) {
      this.dbg.extra.battery = `${fields[2] ?? fields[1]} %`;
    } else if (type === MSG.KEEPALIVE) {
      // nulla da fare
    } else if (type === MSG.INFO || type === MSG.SYSTEM) {
      this.dbg.log(`Info message 0x${type.toString(16)} (ignored)`);
      this.dbg.changed();
      return;
    } else {
      this.dbg.log(`Unknown message type 0x${type.toString(16)} fields ${JSON.stringify(fields)}`);
      if (link.model !== 'click' && ++link.unknown === 3) this.dbg.log(`${label}: many unrecognized messages, the firmware may require an encrypted key exchange (not supported yet, see docs/zwift-controller.md)`);
    }
    if (Object.keys(fields).length) this.dbg.extra.fields = fields;

    if (pressed) {
      const prev = link.pressed;
      const released = [...prev].filter((id) => !pressed.has(id));
      link.pressed = pressed;
      for (const id of released) this.emit('release', { id, role: this.roleOf(id), kind: link.kind });
      for (const id of pressed) {
        if (prev.has(id)) continue; // già premuto: non è una pressione nuova
        this.dbg.extra.lastPressed = id;
        const role = this.roleOf(id);
        if (!role && !this.unknownIds.has(id) && !(id in KNOWN_NAMES)) { this.unknownIds.add(id); this.emit('unknown', { id }); }
        this.dbg.log(`Pressed ${buttonLabel(id)} [${id}] → ${role || 'no role'}`);
        this.emit('press', { id, role, kind: link.kind });
        const dir = SHIFT[role];
        if (role === 'menu') this.emit('combo');
        else if (dir) this.emit('shift', dir);
      }
      this.recompute();
    }
    this.dbg.changed();
  }

  setKind(link, kind) {
    if (link.kind === kind) return;
    link.kind = kind;
    this.dbg.log(`Controller type seen: ${KIND_NAMES[kind]}`);
    this.emit('kind', { kind });
  }

  // Unisce i tasti di tutti i dispositivi e aggiorna 'hold' (direzione tenuta) e 'combo' (+ e − insieme)
  recompute() {
    const all = new Set();
    for (const l of this.links) for (const id of l.pressed) all.add(id);
    this.pressed = all;
    this.dbg.extra.pressed = [...all];
    const roles = [...all].map((id) => this.roleOf(id)).filter(Boolean);
    this.heldRoles = new Set(roles);
    // direzione tenuta premuta (per sterzare in continuo nei giochi)
    let held = 0; for (const r of roles) held += SHIFT[r] || 0;
    held = Math.sign(held);
    if (held !== this.held) { this.held = held; this.emit('hold', held); }
    // + e − insieme: apre il menu di navigazione
    const dirs = new Set(roles.map((r) => SHIFT[r]).filter(Boolean));
    const both = dirs.has(1) && dirs.has(-1);
    if (both && !this.comboOn) this.emit('combo');
    this.comboOn = both;
    this.dbg.changed();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

// Decodifica protobuf minimale: varint (wire 0) come numeri, length-delimited (wire 2) come hex.
export function parseFields(buf) {
  const out = {};
  let i = 0;
  const readVarint = () => {
    let val = 0; let mul = 1;
    while (i < buf.length) {
      const b = buf[i++];
      val += (b & 0x7f) * mul;
      if (!(b & 0x80)) break;
      mul *= 128;
    }
    return val;
  };
  while (i < buf.length) {
    const key = readVarint();
    const field = Math.floor(key / 8); const wire = key & 7;
    if (wire === 0) out[field] = readVarint();
    else if (wire === 2) { const len = readVarint(); out[field] = hex(buf.subarray(i, i + len)); i += len; }
    else if (wire === 5) { i += 4; } else if (wire === 1) { i += 8; } else break;
  }
  return out;
}
