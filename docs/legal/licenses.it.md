# Licenze e crediti

*Ultimo aggiornamento: 15 novembre 2026*

Spindro si basa sul lavoro di altri. Questa pagina elenca ciò che è nel repository o caricato dall'app, con la licenza. È stata controllata sui file del repository (`package.json`, `vendor/`, `assets/`, `site/assets/fonts/`, `android/`, `index.html`). I testi completi delle licenze richiesti dalle licenze stesse sono in [`THIRD-PARTY-NOTICES.md`](https://github.com/C1aud1o/Spindro/blob/main/THIRD-PARTY-NOTICES.md) nella radice del repository.

## Licenza di Spindro

Il codice di Spindro è rilasciato con licenza **GNU GPL-3.0**. Il testo completo è nel file `LICENSE` del repository: https://github.com/C1aud1o/Spindro. Il copyright appartiene ai contributori di Spindro.

## Librerie incluse nell'app

| Componente | Versione | Licenza | Dove |
|---|---|---|---|
| **three.js** (gli autori di three.js) | r170 | MIT | grafica 3D dei giochi: `vendor/three/` (nucleo, `GLTFLoader`, post-elaborazione, `BufferGeometryUtils`). Testo: `vendor/three/LICENSE` |
| **meshoptimizer**, decodificatore (Arseny Kapoulkine) | 0.18 (copia da three.js r170) | MIT | decomprime i modelli 3D: `vendor/three/addons/libs/meshopt_decoder.module.js` |
| **Capacitor Core** (Drifty Co.) | 7.6.10 | MIT | ponte fra l'app web e Android: `vendor/capacitor/`. Testo: `vendor/capacitor/LICENSE` |
| **@capacitor/android** (Drifty Co.) | 7.6.10 | MIT | il guscio Android |
| **@capacitor/local-notifications** (Ionic) | 7.0.7 | MIT | notifiche locali dell'app Android |
| **@capacitor-community/bluetooth-le** | 7.3.2 | MIT | Bluetooth dell'app Android |

Solo per costruire e collaudare (non fanno parte di ciò che installi): **@capacitor/cli** (MIT), **Playwright** (Apache 2.0) e **axe-core** (MPL-2.0, controlli di accessibilità).

L'app Android usa anche AndroidX `appcompat`, `coordinatorlayout` e `core-splashscreen` (The Android Open Source Project, Apache 2.0). Le licenze delle altre dipendenze indirette sono in `package-lock.json`.

## Caratteri

Tutti i caratteri sono **serviti dall'app e dal sito stessi**: non si carica nulla da Google Fonts né da altri servizi di caratteri. Tutti sono con licenza SIL Open Font License 1.1.

| Carattere | Autore | Usato per | File |
|---|---|---|---|
| **Barlow** e **Barlow Condensed** | The Barlow Project Authors (https://github.com/jpt/barlow) | testi e numeri dell'app e del sito | `assets/fonts/barlow-*.woff2` (app), `site/assets/fonts/` (sito). Testo: `assets/fonts/OFL-Barlow.txt`, `site/assets/fonts/LICENSE-OFL.txt` |
| **Lilita One** | Juan Montoreano | titoli dei giochi | `assets/fonts/lilita-one-*.woff2`, `OFL-LilitaOne.txt` |
| **Nunito** | The Nunito Project Authors (https://github.com/googlefonts/nunito) | testi dei giochi | `assets/fonts/nunito-*.woff2`, `OFL-Nunito.txt` |

I file woff2 sono i sottoinsiemi latini dei pacchetti Fontsource, non modificati.

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

I modelli in `assets/3d/meshy/` (edifici, veicoli, personaggi e scenari) e le icone 3D della schermata principale (`assets/icons/`) sono stati generati per Spindro con lo strumento di IA **Meshy** (https://www.meshy.ai). Sono usati secondo i termini di servizio di Meshy e del piano usato: i modelli generati con il piano gratuito di Meshy sono con licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.it) e sono attribuiti a **Meshy** (https://www.meshy.ai); quelli fatti con un piano a pagamento non richiedono attribuzione. Quale modello venga da quale piano non è registrato, quindi tutti sono citati qui. Gli script di generazione sono in `scripts/meshy/` (i file che ne escono passano da `shrink.py` / `decimate.py`; i personaggi ricevono lo scheletro nel gioco, `js/games/kit/autorig.js`).

## Altre risorse

- **Icone e interfaccia** (`icons/`, `css/`): opere originali del progetto, stessa licenza del codice.
- **Icona dell'app e grafiche degli store** (`icons/`, `store/`, icone di avvio e splash di Android, `site/assets/favicon.svg`): opere originali realizzate per il progetto, ridisegnate da `scripts/icons.mjs` a partire da `icons/icon.svg`.
- **Giochi**: originali. Non usano nomi o personaggi di altri giochi.
- **File FIT**: il codice che li scrive (`js/fit.js`) è stato scritto dalla specifica pubblica del formato di file di Garmin. Non include l'SDK di Garmin.
- **Protocolli dei rulli**: Tacx FE-C su Bluetooth (`js/trainers/fec.js`) segue il documento pubblico Tacx "FE-C over BLE" e il profilo ANT+ FE-C; il protocollo Wahoo legacy (`js/trainers/wahoo.js`) è stato confrontato con i progetti open source GoldenCheetah (GPL-3.0), SwiftySensors e incyclist. Sono stati usati solo fatti di protocollo (identificatori, formato dei messaggi); il codice è di Spindro.
- **Zwift Click, Play e Ride**: il supporto (`js/click.js`) nasce dalla ricostruzione open source del protocollo Bluetooth, fatta a fini di interoperabilità: ajchellew/zwiftplay, SwiftControl e qdomyos-zwift (GPL-3.0). **Non è incluso alcun codice, chiave o immagine di Zwift** e Spindro non si collega al servizio Zwift. Dettagli e punti aperti: `docs/zwift-controller.md`.
- **Effetti sonori**: i suoni dei giochi sono generati dal codice; gli unici file audio sono i jingle di Kenney qui sopra.

## Servizi esterni

Strava, YouTube, GitHub e GoatCounter sono servizi di terzi con termini propri. Vedi la [nota sui marchi](trademarks.it.md) e l'[Informativa sulla privacy](privacy.it.md).
