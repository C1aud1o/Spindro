# Licenze e crediti

*Ultimo aggiornamento: 15 novembre 2026*

Spindro si basa sul lavoro di altri. Questa pagina elenca ciò che è nel repository o caricato dall'app, con la licenza. È stata controllata sui file del repository (`package.json`, `vendor/`, `assets/`, `site/assets/fonts/`, `android/`, `index.html`).

## Licenza di Spindro

Il codice di Spindro è rilasciato con licenza **GNU GPL-3.0**. Il testo completo è nel file `LICENSE` del repository: https://github.com/C1aud1o/Spindro. Il copyright appartiene ai contributori di Spindro.

## Librerie incluse nell'app

| Componente | Versione | Licenza | Dove |
|---|---|---|---|
| **three.js** (gli autori di three.js) | r170 | MIT | `vendor/three/` (nucleo e add-on). Testo: `vendor/three/LICENSE` |
| **meshoptimizer**, decodificatore (Arseny Kapoulkine) | 0.18 (copia da three.js r170) | MIT | `vendor/three/addons/libs/meshopt_decoder.module.js` |
| **Capacitor Core** (Drifty Co.) | 7.6.10 | MIT | `vendor/capacitor/`. Testo: `vendor/capacitor/LICENSE` |
| **@capacitor/android** | 7.6.10 | MIT | App Android |
| **@capacitor/local-notifications** | 7.0.7 | MIT | App Android |
| **@capacitor-community/bluetooth-le** | 7.3.2 | MIT | Bluetooth dell'app Android |

Solo per costruire e collaudare (non fanno parte di ciò che installi): **@capacitor/cli** (MIT) e **Playwright** (Apache 2.0).

L'app Android usa anche AndroidX `appcompat`, `coordinatorlayout` e `core-splashscreen` (Apache 2.0). Le licenze delle altre dipendenze indirette sono in `package-lock.json`.

## Caratteri

**Barlow** e **Barlow Condensed** (The Barlow Project Authors), SIL Open Font License 1.1. Il sito li serve dai propri file (`site/assets/fonts/`, testo in `LICENSE-OFL.txt`). L'app li carica da Google Fonts.

**Lilita One** (Juan Montoreano) e **Nunito** (The Nunito Project Authors), SIL Open Font License 1.1: caratteri dei giochi, nei file `assets/fonts/` con le rispettive licenze (`OFL-LilitaOne.txt`, `OFL-Nunito.txt`).

Le icone 3D della schermata principale (`assets/icons`) sono generate con Meshy per il progetto.

## Grafica, modelli 3D e suoni

Di **Kenney** ([kenney.nl](https://www.kenney.nl)) e **Quaternius** ([quaternius.com](https://quaternius.com)), con licenza **Creative Commons Zero (CC0 1.0)**: uso libero, citazione non richiesta. La facciamo comunque.

| Cartella | Contenuto | Licenza |
|---|---|---|
| `assets/3d/blasters/` | Kenney, Blaster Kit 2.1 | CC0 |
| `assets/3d/characters/` | Kenney, Blocky Characters 2.0 | CC0 |
| `assets/3d/graveyard/` | Kenney, Graveyard Kit 5.0 | CC0 |
| `assets/3d/nature/` | Kenney, Nature Kit 2.1 | CC0 |
| `assets/3d/pickups/` | Kenney, Platformer Kit 4.1 | CC0 |
| `assets/3d/racing/` | Kenney, Racing Kit 1.2 | CC0 |
| `assets/3d/quaternius/` | Quaternius: Ultimate Modular Men, Simple Nature Pack, Farm Buildings, Simple Buildings (convertiti e ottimizzati) | CC0 |
| `assets/audio/jingles/` | Kenney, Music Jingles | CC0 |
| `assets/fx/` | Kenney, Particle Pack | CC0 |

Ogni cartella ha il `License.txt` originale. **Grazie, Kenney e Quaternius.**

## Modelli generati per il progetto

I modelli in `assets/3d/meshy/` (edifici, veicoli, personaggi e scenari) sono stati generati per Spindro con lo strumento di IA **Meshy**. Sono usati secondo i termini di servizio di Meshy.

## Altre risorse

- **Icone e interfaccia** (`icons/`, `css/`): opere originali del progetto, stessa licenza del codice.
- **Giochi**: originali. Non usano nomi o personaggi di altri giochi.
- **File FIT**: il codice che li scrive è stato scritto dalla specifica pubblica del formato di Garmin. Non include l'SDK di Garmin.

## Servizi esterni

Strava, YouTube, GitHub e Google Fonts sono servizi di terzi con termini propri. Vedi la [nota sui marchi](trademarks.it.md) e l'[Informativa sulla privacy](privacy.it.md).
