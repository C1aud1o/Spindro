> **Running checklist (remove when finished)**
> - done: reconnect-safe listeners, hub with dropout retry and backoff, per-platform error panel, one-at-a-time suggestions, Devices sheet states, trainer test, translations, scenario tests (`tests/connect.spec.mjs`)
> - left: contact sheet `docs/design/d1-connect.png`, merge with `beta`, final test run

# Connecting devices

How Spindro connects a trainer, a controller, a heart-rate strap, a power meter and a cadence sensor, what works where, and what to do when it does not. For users first, then a section for contributors.

> **Honesty note.** Everything described here was exercised with the fake Bluetooth devices in `tests/fake-ble.js`. Nothing in this document has been verified on real hardware by this change; the compatibility list in `site/data/compatibility.json` is the only place that says a device is verified.

## What works where

| Where | Bluetooth | Notes |
|---|---|---|
| **Android app** (Spindro / Spindro Beta) | Yes, native plugin | Android asks once for “Nearby devices”: tap Allow. Known devices reconnect by themselves. |
| **Chrome or Edge on Android** | Yes, Web Bluetooth | Needs Bluetooth on and the “Nearby devices” permission for the browser. |
| **Chrome, Edge, Opera on Windows, macOS, Linux, ChromeOS** | Yes, Web Bluetooth | Needs the page on `https`. |
| **iPhone / iPad (any browser)** | **No** | Every iOS browser uses Apple's WebKit, which has no Web Bluetooth, and there is no Spindro app for iOS. The free *Bluefy* browser adds Web Bluetooth; or ride from an Android phone or a PC. |
| **Safari (Mac)**, **Firefox (any system)** | **No** | These browsers do not implement Web Bluetooth. Use Chrome or Edge. |

Spindro detects each case in code (`detectSupport` in `js/connect.js`) and says which one applies, instead of showing a generic error.

## Connecting for the first time

1. Turn Bluetooth on and wake the trainer by pedalling a few turns.
2. Tap **Connect your trainer**. That is the only tap inside Spindro; the browser (or Android) then opens its own list.
3. Pick the entry whose name contains your trainer's brand or model (Tacx, KICKR, Van Rysel, Elite…). Live watts appear right away.

The same single button, **Add device**, also adds a controller, heart-rate strap, power meter or cadence sensor. Spindro reads what the device offers and assigns the role itself.

After the trainer connects, Spindro suggests the next likely device, **one at a time**: first “Add your controller”, then “Add heart rate”. One tap opens the browser list filtered to that kind of device. **Not for me** dismisses that suggestion for good. Nothing is suggested while you ride or while a panel is open.

The consent sheet (when statistics are configured) and the safety notice each appear once, ever; connecting a device opens no panel.

### How roles are assigned

| The device offers | Role |
|---|---|
| FTMS, Tacx FE-C over BLE, Wahoo control, or a known trainer name (Tacx, D100, Van Rysel) | **Trainer** (resistance, watts, speed, cadence) |
| Heart Rate service | **Heart rate** |
| Zwift controller service, or a name starting with “Zwift” | **Controls** (Click, Play, Ride) |
| Cycling Power **and** Cycling Speed & Cadence | **Power meter** (with cadence) |
| Cycling Speed & Cadence only | **Cadence sensor** (or speed sensor, from what it sends) |
| Cycling Power only | Ambiguous: Spindro asks once “trainer or power meter?” and remembers the answer. With a trainer already connected it is taken as a power meter without asking. The role can be switched later in the Devices sheet. |
| Nothing Spindro knows | Not supported: see below |

A device with several roles is explained in plain words in its card (“One device, several jobs: trainer + heart rate”). **A trainer that also exposes the Zwift service (Zwift Ready: D100, Kickr Core, Zwift Hub…) is only a trainer**, never a controller.

If two devices give the same data, the dedicated one wins: a power meter over the trainer for watts, a cadence sensor over the trainer for cadence. The two pickers at the bottom of the Devices sheet (“Where the data comes from”) let you override that, and each explains what *Automatic* does.

## Coming back tomorrow

Known devices reconnect at start by themselves where the platform allows it (the Android app always; Chrome when it keeps the Bluetooth permission and implements `navigator.bluetooth.getDevices()`). Each known device shows **Reconnecting…** in the status row and in the Devices sheet.

Where the browser needs a tap, or a device is not found, the big button becomes **Reconnect <name>**. It walks through the known devices one at a time: first without a list if the permission is remembered, otherwise with the browser list narrowed to that device's name. A device that is simply gone can be removed with **Forget this device**.

## Dropouts during a ride

When a trainer or sensor disconnects:

- the ride **keeps recording** (the dropped trainer's watts show as 0 instead of freezing on the last value; no auto-pause is triggered by a dropped trainer);
- a non-blocking banner under the status row says which device dropped;
- Spindro retries by itself after 1, 2, 5, 10, 15 then 30 s (the last wait repeats) for as long as the ride lasts; outside a ride it gives up after four tries and shows **Try now**;
- on reconnect the previous control mode and target are sent again (ERG watts, gear, grade, resistance or the current workout step), the controller mapping and heart-rate feed resume, and the banner disappears.

Listeners are replaced, not added, on every reconnect (`js/ble-util.js`), so data never arrives twice. This is covered by tests that drop devices during the handshake, twice in a row, during a workout and with a game open.

## The Devices sheet

Open it from the status row. Each device shows:

- its **role(s)**, and for a trainer the protocol (FTMS, FE-C, Wahoo, CP/CSC);
- a **state**: Connected, Reconnecting… (with the next try), Lost;
- a **sign of life**: “Live data”, or “Last data 12 s ago” in amber when it goes quiet;
- **battery** when the device reports it;
- one plain sentence about what it does for you.

**Test resistance** (trainer only, only when you are not riding, only if the trainer can be controlled) raises and lowers the resistance for about 10 seconds so you can feel that control works, then restores the previous mode and target. Starting a ride during the test stops it and restores everything.

## Unusual setups

- **Trainer with only Cycling Power**: asked once, remembered. If it is a power meter, resistance cannot be controlled.
- **Power meter + a trainer that cannot be controlled (or no trainer)**: Spindro reads your watts; set the resistance on the trainer itself. The Devices sheet says so.
- **Two heart-rate sources**: the one added last is used and the earlier one is disconnected (you are told). A trainer that relays heart rate is not disconnected by a strap added later.
- **Second controller**: both stay connected (Zwift Play comes as a left and right pair).
- **The same device chosen twice**: “<name> is already connected.”
- **A device Spindro does not support**: the message names it and lists its Bluetooth services, with **Report this device**, which opens a pre-filled GitHub issue (`js/report.js`). The issue contains only the Bluetooth name, the service list, app version, platform and language; no personal data.
- **Trainer held by another app**: if the device is found but the connection fails, Spindro says so with the device name: close Zwift, the manufacturer's app, another training app or another Spindro tab (a trainer talks to one app at a time).

## Troubleshooting

| Symptom | What to do |
|---|---|
| “Bluetooth is off” | Turn it on (Android: swipe down; Windows: Settings → Bluetooth & devices; macOS: System Settings → Bluetooth), then **Try again**. |
| “Bluetooth permission is blocked” | Android app: Settings → Apps → Spindro → Permissions → Nearby devices → Allow. Chrome: icon left of the address → Site settings → Bluetooth → Allow, and check Chrome has Nearby devices on Android. |
| The list is empty | Wake the trainer (pedal until its light blinks), keep the phone within 2 m, close other apps that use the trainer. |
| “Couldn't connect to <name>” | Another app is almost certainly connected to it. Close it, wait a few seconds, try again. |
| Connects, but no resistance control | Use **Test resistance**. If nothing changes, the trainer may only offer read-only Cycling Power: report it. |
| iPhone / iPad | Not possible in a browser. See the table above. |

## For contributors

| File | Role |
|---|---|
| `js/connect.js` | Pure helpers: `detectSupport`, `explainError`, `nextSuggestion`, `BACKOFF_MS`. No Bluetooth, no DOM. |
| `js/devices.js` | `Devices` hub: one chooser, `classify()`, roles, entry states, dropout retry (`onDrop` / `retry`), `reconnectKnown`, `reconnectNext`. Events: `change`, `meter`, `drop`, `back`, `lost`, `notice`. |
| `js/devices-ui.js` | Devices sheet and `problemHtml()` (the help box used by home and sheet). |
| `js/trainer-test.js` | “Test resistance”. |
| `js/ble-util.js` | `listen(owner, key, target, type, fn)`: replaces the previous listener with the same key. Every driver uses it. |
| `js/app.js` | Wiring: banner, suggestion, restore after reconnect (`applyMode(true)`), ERG keep-alive (unchanged). |
| `tests/fake-ble.js` | Fake devices; hooks `drop(kind)`, `dropAt`, `failConnect`, `connectDelay`, kinds `weird`, `hr2`, `dumb`, `trainer-hr`. |
| `tests/connect.spec.mjs` | The scenarios above. |

Rules that stay: do not change the FTMS, FE-C or Wahoo protocol code, the ERG keep-alive (the target is re-sent about every 2 s), or the rule that a trainer exposing the Zwift service is only a trainer, except to fix a defect shown by a test. User-facing text goes through `js/i18n.js` in all five locales (`connect.*`, `devices.*`).

Tests set `localStorage.setItem('analytics','0')` (no consent sheet), `mode` = `gears` when they need virtual gears, and `autoPause` = `0` when they must control when the ride starts. The hub's retry waits can be shortened in a test with `window.rfDevices.hub.backoffMs = [80]`.
