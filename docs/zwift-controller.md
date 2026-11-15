# Zwift controllers: Click, Play, Ride

Code: `js/click.js` (protocol, roles, learning), `js/clicknav.js` (navigation and legend), `js/clickcheck.js` (key check), `js/app.js` (wiring).
Tests: `node tests/controllers/zwift-controllers.test.cjs` (fake Web Bluetooth in Playwright), `tests/click-nav.spec.mjs`, `tests/click-roles.spec.mjs`.
Behaviour (roles, navigation, legend, key check): `docs/click-navigazione.md`.

## Sources (open source) used for the protocol
- ajchellew/zwiftplay — https://github.com/ajchellew/zwiftplay (UUIDs, handshake, Play messages)
- SwiftControl — https://github.com/jonasbark/swiftcontrol (Click v2, Ride, Play)
- qdomyos-zwift — https://github.com/cagnulein/qdomyos-zwift (zwiftclickremote / zwiftplayremote)

These were consulted from memory, not re-read line by line: anything marked “unverified” must be compared with the sources.

## What is implemented
- One “Click” button in the app connects every model (name filter `Zwift*` or service `0xfc82`).
- Model recognised from the BLE name (`Ride` → Zwift Ride, `Play` → Zwift Play, otherwise Click) and refined by the message type
  (`0x37` = Click v1, `0x23` = Click v2 or Ride, `0x07` = Play). UI status: “Zwift Click / Zwift Play / Zwift Play ×2 / Zwift Ride”.
- **Two Plays together**: after the first, tapping the button again offers the second. Each device has its own key state; `hold` and
  the combo are computed on the union.
- Handshake: plain `RideOn`, notifications on `…0002` and `…0004`.
- **Roles** (`plus`, `minus`, `up`, `down`, `left`, `right`, `ok`, `back`, `menu`) on top of raw ids, learned and stored per device
  family (`clickRoles`); see the key check in `docs/click-navigazione.md`.

## Default roles
| Controller | Roles |
|---|---|
| Click v1 | `v1:1` plus, `v1:2` minus (fields 1 / 2 of `0x37`, 0 = pressed) |
| Click v2 (`ride:n`, bitmask of `0x23`, 0 = pressed) | **verified**: 12 = plus, 8 = minus. **Unverified**: 1 up, 3 down, 0 left, 2 right, 4 `ok` (A), 5 `back` (B); 6 (Y) and 7 (Z) have no role until you map them; paddles 9/10/13/14 as plus/minus (they only exist on the Ride) |
| Play (`play:n`, same fields on both controllers) | 2 up (Y), 3 left (Z), 4 right (A), 5 down (B), 6 = menu key. All **unverified**; there is no `ok` / `back`, so ▶ / ◀ held choose / go back |
| Ride (`zr:n`, bitmask) | paddles 9/10 (left) and 13/14 (right) plus/minus; 1/3/0/2 arrows; **A/B/Y/Z (4/5/6/7) shift as before** (plus/minus) until mapped to `ok` / `back` in the key check; 12 and 17 = menu. All **unverified** |

Riding / in a game, `up` / `right` / `plus` shift +1 and `down` / `left` / `minus` shift −1 (arrows left / right on the Click v2 now
shift too, as they go to the game). In menus the arrows move spatially. `menu`, or `+` and `−` together (also across two Plays), opens the
Click menu. Roles can be changed from the key check or the debug page (“Use as +/−/no action”); the old `clickMap` is migrated once.

## Not implemented / to verify on real hardware
1. **Encrypted Play / Ride handshake.** Some firmwares answer `RideOn` with extra data (a public key) and then encrypt messages (as I recall:
   ECDH Curve25519 + HKDF, AES-CCM with a 4-byte tag and a counter). Without a device the nonce, HKDF `info` and format cannot be checked, so no
   invented crypto was written. If the controllers do not react, the debug log suggests it (unknown `0x??` messages / “RideOn + data”). It would also
   need AES-CCM, which WebCrypto does not offer.
2. **Bit and field names.** Of the Click v2 bitmask only **+ = bit 12** and **− = bit 8** are verified on a real device (a Click of a Van Rysel D100
   “Zwift Ready”). The names of bits 0–3 (arrows), 4–7 (A/B/Y/Z), the paddles and the Ride's menu keys, and the Play fields (2 = Y/Up, 3 = Z/Left,
   4 = A/Right, 5 = B/Down, 6 = Zwift, 7 = shift lever; field 1 = side, not a key) come from the open-source table and are **unverified**. The key check
   and its report are the way to confirm or correct them.
3. **Click v1 vs v2 at connect time**: both are called “Zwift Click”; the app learns the version from the first message, so until a key is pressed
   it behaves as a two-key controller.
4. **Left / right Play controller**: the two send the same fields, so the app cannot tell them apart and both get the same roles.
5. Analog levers of the Play (fields 8–9) and the Ride's power-up keys: ignored.
6. Android app (Capacitor): the `0xfc82` service filter and two simultaneous BLE connections were not tried.
7. Long-press lengths (0.65 s / 0.8 s) and spatial navigation on a real controller.
