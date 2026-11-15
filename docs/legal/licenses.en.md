# Licences and credits

*Last updated: 15 November 2026*

Spindro is built on the work of others. This page lists what is in the repository or loaded by the app, with its licence. It was checked against the repository files (`package.json`, `vendor/`, `assets/`, `site/assets/fonts/`, `android/`, `index.html`).

## Spindro's licence

Spindro's code is released under the **GNU GPL-3.0** licence. The full text is in the `LICENSE` file of the repository: https://github.com/C1aud1o/Spindro. Copyright belongs to the Spindro contributors.

## Libraries included in the app

| Component | Version | Licence | Where |
|---|---|---|---|
| **three.js** (the three.js authors) | r170 | MIT | `vendor/three/` (core and add-ons). Text: `vendor/three/LICENSE` |
| **meshoptimizer** decoder (Arseny Kapoulkine) | 0.18 (copy from three.js r170) | MIT | `vendor/three/addons/libs/meshopt_decoder.module.js` |
| **Capacitor Core** (Drifty Co.) | 7.6.10 | MIT | `vendor/capacitor/`. Text: `vendor/capacitor/LICENSE` |
| **@capacitor/android** | 7.6.10 | MIT | Android app |
| **@capacitor/local-notifications** | 7.0.7 | MIT | Android app |
| **@capacitor-community/bluetooth-le** | 7.3.2 | MIT | Bluetooth of the Android app |

Only for building and testing (not in what you install): **@capacitor/cli** (MIT) and **Playwright** (Apache 2.0).

The Android app also uses AndroidX `appcompat`, `coordinatorlayout` and `core-splashscreen` (Apache 2.0). Licences of other indirect dependencies are in `package-lock.json`.

## Fonts

**Barlow** and **Barlow Condensed** (The Barlow Project Authors), SIL Open Font License 1.1. The website serves them from its own files (`site/assets/fonts/`, text in `LICENSE-OFL.txt`). The app loads them from Google Fonts.

**Lilita One** (Juan Montoreano) and **Nunito** (The Nunito Project Authors), SIL Open Font License 1.1: the game fonts, in `assets/fonts/` with their license files (`OFL-LilitaOne.txt`, `OFL-Nunito.txt`).

The 3D icons on the home screen (`assets/icons`) were generated with Meshy for the project.

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

The models in `assets/3d/meshy/` (buildings, vehicles, characters and scenery) were generated for Spindro with the AI tool **Meshy**. They are used under Meshy's terms of service.

## Other resources

- **Icons and interface** (`icons/`, `css/`): original works of the project, same licence as the code.
- **Games**: original. They use no names or characters from other games.
- **FIT files**: the code that writes them was written from Garmin's public format specification. It does not include Garmin's SDK.

## External services

Strava, YouTube, GitHub and Google Fonts are third-party services with their own terms. See the [trademark notice](trademarks.en.md) and the [Privacy Policy](privacy.en.md).
