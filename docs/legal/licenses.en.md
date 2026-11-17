# Licences and credits

*Last updated: 15 November 2026*

Spindro is built on the work of others. This page lists what is in the repository or loaded by the app, with its licence. It was checked against the repository files (`package.json`, `vendor/`, `assets/`, `site/assets/fonts/`, `android/`, `index.html`). The full licence texts that the licences require are in [`THIRD-PARTY-NOTICES.md`](https://github.com/C1aud1o/Spindro/blob/main/THIRD-PARTY-NOTICES.md) at the root of the repository.

## Spindro's licence

Spindro's code is released under the **GNU AGPL-3.0** licence. The full text is in the `LICENSE` file of the repository: https://github.com/C1aud1o/Spindro. Copyright belongs to the Spindro contributors.

## Libraries included in the app

| Component | Version | Licence | Where |
|---|---|---|---|
| **three.js** (the three.js authors) | r170 | MIT | 3D graphics of the games: `vendor/three/` (core, `GLTFLoader`, post-processing, `BufferGeometryUtils`). Text: `vendor/three/LICENSE` |
| **meshoptimizer** decoder (Arseny Kapoulkine) | 0.18 (copy from three.js r170) | MIT | decompresses the 3D models: `vendor/three/addons/libs/meshopt_decoder.module.js` |
| **Capacitor Core** (Drifty Co.) | 7.6.10 | MIT | bridge between the web app and Android: `vendor/capacitor/`. Text: `vendor/capacitor/LICENSE` |
| **@capacitor/android** (Drifty Co.) | 7.6.10 | MIT | the Android shell |
| **@capacitor/local-notifications** (Ionic) | 7.0.7 | MIT | local notifications of the Android app |
| **@capacitor-community/bluetooth-le** | 7.3.2 | MIT | Bluetooth of the Android app |

Only for building and testing (not in what you install): **@capacitor/cli** (MIT), **Playwright** (Apache 2.0) and **axe-core** (MPL-2.0, accessibility checks).

The Android app also uses AndroidX `appcompat`, `coordinatorlayout` and `core-splashscreen` (The Android Open Source Project, Apache 2.0). Licences of other indirect dependencies are in `package-lock.json`.

## Fonts

All fonts are **served by the app and the website themselves**: nothing is loaded from Google Fonts or any other font service. All are under the SIL Open Font License 1.1.

| Font | Author | Used for | Files |
|---|---|---|---|
| **Barlow** and **Barlow Condensed** | The Barlow Project Authors (https://github.com/jpt/barlow) | text and numbers of the app and the website | `assets/fonts/barlow-*.woff2` (app), `site/assets/fonts/` (website). Text: `assets/fonts/OFL-Barlow.txt`, `site/assets/fonts/LICENSE-OFL.txt` |
| **Lilita One** | Juan Montoreano | titles of the games | `assets/fonts/lilita-one-*.woff2`, `OFL-LilitaOne.txt` |
| **Nunito** | The Nunito Project Authors (https://github.com/googlefonts/nunito) | texts of the games | `assets/fonts/nunito-*.woff2`, `OFL-Nunito.txt` |

The woff2 files are the Latin subsets from the Fontsource packages, unmodified.

## Graphics, 3D models and sounds

From **Kenney** ([kenney.nl](https://www.kenney.nl)) and **Quaternius** ([quaternius.com](https://quaternius.com)), under **Creative Commons Zero (CC0 1.0)**: free to use, credit not required. We give it anyway.

| Folder | Content | Licence |
|---|---|---|
| `assets/3d/blasters/` | Kenney, Blaster Kit 2.1 | CC0 |
| `assets/3d/characters/` | Kenney, Blocky Characters 2.0 | CC0 |
| `assets/3d/graveyard/` | Kenney, Graveyard Kit 5.0 | CC0 |
| `assets/3d/nature/` | Kenney, Nature Kit 2.1 | CC0 |
| `assets/3d/pickups/` | Kenney, Platformer Kit 4.1 | CC0 |
| `assets/3d/racing/` | Kenney, Racing Kit 1.2 | CC0 |
| `assets/3d/quaternius/` | Quaternius: Ultimate Modular Men, Simple Nature Pack, Farm Buildings, Simple Buildings (converted and optimised) | CC0 |
| `assets/audio/jingles/` | Kenney, Music Jingles | CC0 |
| `assets/fx/` | Kenney, Particle Pack | CC0 |

Each folder has the original `License.txt`. **Thank you, Kenney and Quaternius.**

## Models generated for the project

The models in `assets/3d/meshy/` (buildings, vehicles, characters and scenery) and the 3D icons of the home screen (`assets/icons/`) were generated for Spindro with the AI tool **Meshy** (https://www.meshy.ai). They are used under Meshy's terms of service and the terms of the plan used: models generated on Meshy's free plan are licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and are credited to **Meshy** (https://www.meshy.ai); models made on a paid plan need no attribution. Which model came from which plan is not recorded, so all are credited here. The generation scripts are in `scripts/meshy/` (the files that come out of them go through `shrink.py` / `decimate.py`; the characters get a skeleton in the game, `js/games/kit/autorig.js`).

## Other resources

- **Icons and interface** (`icons/`, `css/`): original works of the project, same licence as the code.
- **App icon and store graphics** (`icons/`, `store/`, the Android launcher and splash images, `site/assets/favicon.svg`): original artwork made for the project, redrawn by `scripts/icons.mjs` from `icons/icon.svg`.
- **Games**: original. They use no names or characters from other games.
- **FIT files**: the code that writes them (`js/fit.js`) was written from Garmin's public file format specification. It does not include Garmin's SDK.
- **Trainer protocols**: Tacx FE-C over Bluetooth (`js/trainers/fec.js`) follows Tacx's public "FE-C over BLE" how-to and the ANT+ FE-C profile; the Wahoo legacy protocol (`js/trainers/wahoo.js`) was compared with the open-source projects GoldenCheetah (AGPL-3.0), SwiftySensors and incyclist. Only protocol facts (identifiers, message layouts) were used; the code is Spindro's own.
- **Zwift Click, Play and Ride**: support (`js/click.js`) comes from open-source reverse engineering of the Bluetooth protocol, done for interoperability: ajchellew/zwiftplay, SwiftControl and qdomyos-zwift (AGPL-3.0). **No Zwift code, key or image is included**, and Spindro does not connect to the Zwift service. Details and open questions: `docs/zwift-controller.md`.
- **Sound effects**: the game sounds are generated by the code; the only audio files are the Kenney jingles above.

## External services

Strava, YouTube, GitHub and GoatCounter are third-party services with their own terms. See the [trademark notice](trademarks.en.md) and the [Privacy Policy](privacy.en.md).
