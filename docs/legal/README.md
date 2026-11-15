# Documenti legali di Spindro

Testi pubblici, in italiano (`*.it.md`) e inglese (`*.en.md`). Sono generati in pagine del sito da `node site/build.mjs`.

> Non sono una consulenza legale. Descrivono il progetto **di oggi**: chi li modifica deve verificarli sul codice.

| File | Contenuto |
|---|---|
| `privacy` | Informativa: nessun dato raccolto, tutto resta sul dispositivo |
| `terms` | Termini d'uso |
| `account-deletion` | Oggi: non esistono account; come cancellare i dati locali |
| `licenses` | Licenze e crediti, verificati sui file del repo |
| `trademarks` | Nota sui marchi |

Chi cura il progetto è "il progetto Spindro, un progetto open source curato da volontari". Nessun nome, indirizzo o email personale. Contatto: segnalazioni GitHub e, per questioni riservate, le segnalazioni private di sicurezza di GitHub. Legge applicabile: italiana, senza foro.

## Perché oggi è possibile

`js/config.js` ha `FIREBASE_CONFIG = null`, `SENTRY_DSN = ''`, `GOATCOUNTER_URL = ''`, `STRAVA_PROXY = ''`: nessun account, nessuna statistica, nessun server nostro. I flussi verso terzi partono dall'utente: YouTube, Strava (credenziali API dell'utente), GitHub (segnalazione del rullo), Google Fonts nell'app (`index.html`; il sito invece serve i font da sé).

## Quando cambia il codice, cambiano i testi

A ogni nuovo servizio, dato salvato o inviato, dipendenza o asset: aggiorna privacy, licenze e data **nello stesso commit**.

## PRIMA di attivare account, statistiche o il Play Store

Non attivare `FIREBASE_CONFIG`, `SENTRY_DSN`, `GOATCOUNTER_URL` né `STRAVA_PROXY`, e non pubblicare sul Play Store, finché non ci sono:

1. **Un titolare identificato con un contatto** (GDPR art. 13): nome e recapito di chi tratta i dati. Oggi non serve perché non si trattano dati.
2. **L'email di contatto pubblica** richiesta da Google Play per la scheda dell'app.
3. **La revisione di un professionista** dei testi in `future/`.

Poi sostituire i testi pubblici con quelli di `future/` (bozze con segnaposto, non pubblicate): `privacy-with-accounts`, `terms-with-accounts`, `account-deletion-with-accounts`. `future/play-checklist-and-old-notes.md` contiene le vecchie note: segnaposto, basi giuridiche, checklist "Sicurezza dei dati" di Play.

## Da controllare

- Modelli Meshy (`assets/3d/meshy/`): verificare che il piano Meshy usato consenta l'uso nel progetto e annotare le condizioni.
- Play "Sicurezza dei dati" senza account: citare Google Fonts, YouTube e Strava (vedi `future/`).
- Non esiste una voce nell'app per cancellare tutti i dati: la pagina `account-deletion` indica la cancellazione dei dati del sito o dell'app.
