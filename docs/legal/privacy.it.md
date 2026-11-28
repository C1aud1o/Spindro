# Informativa sulla privacy di Spindro

*Ultimo aggiornamento: 28 novembre 2026*

Spindro è un'app gratuita e open source per rulli smart. Funziona nel browser e come app Android. È curata dal progetto Spindro, un progetto open source curato da volontari.

## In breve

- **Spindro non ha account né server propri.** Non raccogliamo, non riceviamo e non conserviamo dati personali.
- Contiamo le visite in forma **anonima**, senza cookie. Nell'app **solo se dici di sì**: se non rispondi, o dici di no, l'app non invia nulla al contatore.
- Uscite, impostazioni e dati del rullo restano **sul tuo dispositivo**.
- Il sito e l'app **non usano cookie** né caratteri o tracciatori di terzi.
- Le uniche connessioni verso altre aziende sono elencate qui sotto. Ognuna parte da una tua azione, tranne il contatore di visite del sito e l'hosting dei file.

## Cosa resta sul tuo dispositivo

L'app salva solo sul tuo dispositivo, nella memoria locale del browser (`localStorage`) o nella memoria propria dell'app Android. Noi non possiamo vederla:

- impostazioni (lingua, musica e suoni, sensazione del cambio, sorgenti dei dispositivi, qualità dei giochi), FTP, frequenza cardiaca massima, peso e obiettivo settimanale;
- storico delle uscite (con i campioni usati per i grafici), allenamenti creati, avanzamento dei piani, record e livelli dei giochi;
- nome e tipo di protocollo dei rulli e dei sensori Bluetooth usati in precedenza, e la mappa dei tasti dei controller Zwift;
- se colleghi Strava in "modalità personale": il tuo Client ID e Client Secret di Strava e i token di accesso che Strava dà all'app, finché non ti scolleghi o cancelli i dati;
- le tue risposte alla domanda sulle statistiche e all'avviso di sicurezza;
- l'ultimo link usato per un'uscita con video.

L'app web tiene anche una copia dei propri file nella cache del browser (service worker) per funzionare offline. Non usa cookie né IndexedDB.

Su Android i dati di Spindro **non** entrano nel backup cloud di Google (l'app li esclude di proposito, perché lo storico delle uscite è personale). Vengono copiati solo quando passi direttamente da un telefono a un altro con il trasferimento di Android (cavo o configurazione guidata), così non perdi lo storico cambiando telefono. Puoi anche esportare ogni uscita come file FIT quando vuoi.

## Bluetooth e sensori

L'app parla con rullo, misuratore di potenza, fascia cardio e controller Zwift via Bluetooth. I dati servono in diretta e sono salvati solo nello storico sul tuo dispositivo. Non ci vengono inviati.

L'app Android chiede questi permessi:

| Permesso | Perché |
|---|---|
| Dispositivi nelle vicinanze: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` | trovare e collegare rullo, sensori e controller. La ricerca è dichiarata "mai per la posizione". |
| `BLUETOOTH_ADVERTISE` | il ponte facoltativo verso l'orologio Garmin: il telefono si annuncia come normale sensore Bluetooth di ciclismo, così l'orologio legge velocità, potenza e cadenza. Si usa solo quando attivi il ponte. |
| Posizione (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`), **solo Android 11 e precedenti** | su quelle versioni Android la richiede per cercare dispositivi Bluetooth. Spindro non legge la tua posizione. |
| `BLUETOOTH`, `BLUETOOTH_ADMIN`, solo Android 11 e precedenti | forma più vecchia dei permessi Bluetooth qui sopra. |
| `INTERNET` | caricare l'app e i servizi elencati sotto quando li usi. |
| `VIBRATE` | risposta tattile. |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` (aggiunti dal componente delle notifiche) | il promemoria giornaliero facoltativo del tuo piano di allenamento: le notifiche sono programmate e mostrate solo sul tuo telefono, non viene inviato nulla. Il sistema chiede il permesso per le notifiche solo se attivi il promemoria. |

L'app Android può anche ricevere un link condiviso da un'altra app (per esempio "Condividi" di YouTube) per aprirlo come uscita con video. Legge solo il testo condiviso.

## Finestra mini e l'estensione facoltativa "Spindro Remote"

- **Finestra mini.** Su Chrome ed Edge per computer Spindro può mostrare i numeri dell'allenamento in una piccola finestra sempre in primo piano (la funzione Picture-in-Picture del browser). La disegna l'app sul tuo dispositivo; non viene inviato nulla.
- **Spindro Remote** è un'estensione del browser separata e facoltativa (vedi `docs/extension.md`). Permette al Zwift Click di comandare un video in un'altra scheda. **Non raccoglie, non salva e non invia nulla**: niente statistiche, niente codice remoto, niente account. Parla soltanto con la pagina di Spindro nello stesso browser e con le schede che scegli tu, sul tuo dispositivo. Le sue uniche impostazioni (la scheda fissata, i siti consentiti, l'interruttore "modalità forte") restano nella memoria dell'estensione nel browser. Concedi l'accesso sito per sito e puoi togliere un sito, o l'estensione, in qualsiasi momento. La "modalità forte" facoltativa usa l'interfaccia di debug del browser e Chrome mostra il suo avviso finché è attiva.

## Cosa caricano dalla rete l'app e il sito

- **I file dell'app**, dallo stesso sito (`spindro.fit`), ospitato su GitHub Pages. GitHub può registrare i dati tecnici standard di una richiesta, come l'indirizzo IP.
- **Caratteri:** tutti i caratteri sono serviti dall'app e dal sito stessi. Non si carica nulla da Google Fonts né da altri servizi di caratteri.
- **Contatore di visite, sito:** lo script di GoatCounter (`gc.zgo.at`), vedi sotto.
- **Contatore di visite, app:** solo dopo il tuo sì, vedi sotto.
- **YouTube, Strava, GitHub:** solo quando usi quelle funzioni, vedi sotto.
- I link verso altri siti (per esempio Garmin Connect, le pagine di assistenza dei produttori di orologi, la ricerca su YouTube) si aprono nel browser solo se li tocchi.

## Statistiche anonime

Per capire quante persone usano Spindro contiamo le visite con **GoatCounter** (`goatcounter.com`), un servizio open source che non usa cookie e non salva nulla sul tuo dispositivo.

- **Sul sito** si conta la pagina aperta, con dati tecnici generici: pagina di provenienza, tipo di browser e di sistema, dimensione dello schermo, paese. L'indirizzo IP non viene conservato.
- **Nell'app** il conteggio parte **solo se acconsenti** alla prima apertura. Se non rispondi, o rispondi "No", l'app non carica il contatore e non invia nulla; la domanda non si ripete. Puoi cambiare idea quando vuoi in Impostazioni → Privacy. Si contano: app aperta e dove (app Android, app web installata o browser), lingua, il tipo di dispositivo che si collega (rullo e tipo di protocollo, per esempio FTMS; fascia cardio; controller; sensore di potenza o cadenza), un collegamento che non riesce e il tipo di problema, uscite e allenamenti iniziati e finiti con la durata solo a fasce (per esempio da 15 a 30 minuti), gioco aperto, e il tempo in cui l'app resta sullo schermo come traguardi (1, 5, 15 e 60 minuti). Mai potenza, battito, posizione o nomi dei dispositivi. Se questo elenco cresce, l'app te lo chiede di nuovo prima di contare qualcosa di nuovo; un "No" non viene mai richiesto di nuovo.

Non possiamo risalire a te da questi dati.

## Segnalazione degli errori

Spindro non invia segnalazioni di arresto o di errore. Se qualcosa non va, puoi segnalarlo tu su GitHub (vedi sotto).

## Servizi che scegli tu di usare

Partono solo quando agisci tu. Hanno le proprie informative.

- **YouTube.** Se avvii un'uscita con video, il lettore e il suo script vengono caricati da YouTube (`www.youtube.com`). YouTube può usare cookie e raccogliere dati, come per ogni video incorporato. Usando questa funzione sei soggetto anche ai [Termini di servizio di YouTube](https://www.youtube.com/t/terms) e alla [Privacy Policy di Google](https://policies.google.com/privacy). Spindro non registra, non scarica e non separa l'audio dei video di YouTube.
- **Strava.** Se colleghi Strava usi la "modalità personale": crei la tua applicazione API di Strava e inserisci le sue credenziali, e l'app parla direttamente con Strava (`www.strava.com`). Il file dell'uscita (`.FIT`, che include il battito se usi una fascia), il nome e la descrizione dell'attività vanno dal tuo dispositivo a Strava. Il token di accesso resta sul tuo dispositivo. Il progetto Spindro non ha alcun server in mezzo. Puoi scollegarti nell'app (l'app chiede anche a Strava di revocare il token) e revocare l'accesso dalle impostazioni di Strava.
- **GitHub.** Se tocchi "Segnala il tuo rullo" o "Segnala un problema", l'app apre nel browser una segnalazione GitHub già compilata. Contiene nome Bluetooth del rullo, servizi, protocollo, piattaforma, versione dell'app, browser e lingua. Non viene inviato nulla finché non premi invio su GitHub. Le segnalazioni su GitHub sono pubbliche.

## I tuoi diritti

Poiché non conserviamo dati personali su di te, non c'è nulla da fornire, correggere o cancellare. Per eliminare i dati locali usa "Cancella tutti i dati" nelle Impostazioni, cancella i dati del sito nel browser, svuota la memoria dell'app nelle impostazioni di Android o disinstalla l'app. Per i dati detenuti da Google, Strava, YouTube, GitHub o GoatCounter rivolgiti a quelle aziende. Puoi anche presentare reclamo all'autorità per la protezione dei dati (in Italia, il Garante per la protezione dei dati personali).

## Età minima

Spindro non è pensata per i minori di 14 anni.

## Sicurezza

Tutte le connessioni usano HTTPS. Il codice è pubblico: chiunque può verificare cosa fa l'app. https://github.com/C1aud1o/Spindro

## Modifiche

Se qualcosa cambia, per esempio con account o statistiche, aggiorneremo questa pagina e la sua data **prima** che la modifica sia attiva.

## Contatti

Domande: apri una segnalazione su https://github.com/C1aud1o/Spindro/issues. Per questioni riservate usa le segnalazioni private di sicurezza di GitHub, nello stesso repository. Non scrivere dati personali nelle segnalazioni pubbliche.
