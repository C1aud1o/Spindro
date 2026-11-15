# Navigazione con il Click (e Play / Ride)

Obiettivo: con il Zwift Click collegato si fa **tutto senza toccare il telefono**.

## Regole

| Situazione | + / − | Tieni + | Tieni − |
|---|---|---|---|
| **Fermo** (nessuna uscita in corso, nessun allenamento, nessun gioco in azione) | sposta la selezione (avanti / indietro) | sceglie l'elemento | torna indietro |
| **Pedalando** (uscita in corso o allenamento) | marcia / intensità, come sempre | musica "avanti" (solo app Android) | apre il **menu Click** (≈ 0,8 s) |
| **In un gioco** | comandi del gioco | — | apre il menu Click del gioco |
| **Dentro il menu Click, un pannello o una finestra** | come "fermo" | come "fermo" | come "fermo" |
| **Campo "preso"** (numero o elenco) | cambia il valore | finisce | finisce |

La navigazione parte **da sola** appena il Click è collegato e non si sta pedalando: non serve nessun gesto. Il combo **+ e − insieme** resta come scorciatoia per aprire/chiudere il menu Click, ma non è più necessario.

- La selezione è un bordo giallo spesso con alone che pulsa (arancione quando un campo è "preso"), visibile anche da 1 m.
- Parte dall'elemento più utile: "Collega il rullo" (primo avvio) o la riga dei dispositivi se il rullo non c'è, altrimenti "Avvia"; nei pannelli il primo elemento utile (non la ×); nel menu giochi il primo gioco; nelle finestre di conferma "Sì".
- **Interruttori e chip**: tieni + li attiva. **Campi numerici e menu a tendina**: tieni + li "prende" (la barra diventa arancione), poi + / − cambiano il valore, tieni + o − per finire. **Campi di testo**: sono solo per tastiera.
- **Menu Click** (pedalando o con il combo): pausa/avvia, termina allenamento / uscita, dispositivi, allenamenti, giochi, video, storico, impostazioni, torna alla home, chiudi. In un gioco: riprendi, esci dal gioco (menu giochi), torna alla home, audio, pausa.
- **Barra di aiuto** in basso, sempre coerente: "+ avanti · − indietro · tieni + scegli · tieni − torna"; con un campo preso "+ aumenta · − diminuisci · tieni + o − fatto"; pedalando "+ / − cambia · tieni − menu".
- Il "tieni −" al primo livello non fa nulla in home (niente uscita per sbaglio).
- Le conferme (prima `confirm()` del browser) usano `js/dialog.js` (`ask()`): sono finestre dell'app, quindi raggiungibili col Click.

## Tastiera (PC e test)
Frecce / `+` `-` = + / − · **Invio** = tieni + · **Esc** = tieni − (pedalando apre il menu Click) · **M** = apre/chiude il menu Click. Quando la navigazione non è attiva (nessun Click, nessun menu aperto) le frecce cambiano marcia come prima.

## Come è fatto
- `js/click.js` emette `shift` (pressione), `hold` (direzione tenuta: +1 / −1 / 0) e `combo` (+ e − insieme).
- `js/clicknav.js` decide **da sola** se la navigazione è accesa (`sync()`, ogni 150 ms e a ogni tasto): acceso se il Click è collegato e (c'è qualcosa aperto sopra la home **oppure** non si sta pedalando). "Si sta pedalando" lo dice l'app (`playing()`).
- Ambito (`scope()`): menu Click > finestre `.calib` > pannelli `.sheet` > debug > giochi > home. Gli elementi raggiungibili sono i controlli visibili di quell'ambito.
- `js/app.js` collega `enabled`, `playing`, `prefer`, `undo` (la pressione lunga di − è già stata contata come un −: la annulla), `menuItems` e `window.rfBack()` (chiude menu, finestre, pannelli, giochi).
- I giochi non sono toccati: ricevono solo `input()` / `hold()` come prima. Limite noto: aprendo il menu in un gioco il gioco **non** va in pausa da solo (i giochi non hanno una pausa).

## Test
`tests/click-nav.spec.mjs`, col Click finto (`window.__fakeBle.press(±1)` e `window.__fakeBle.hold(±1, ms)` per la pressione lunga). Non provato su un Click vero: la lunghezza delle pressioni lunghe (0,65 s / 0,8 s) va verificata a mano.

## Dispositivi (H1)
La riga di stato in home (`#deviceBar`) apre il pannello **Dispositivi**: elenco dei collegati (ruolo, batteria, Scollega), un solo "Aggiungi dispositivo" (`#addDevice`, una sola scelta Bluetooth con tutti i servizi supportati) e le fonti di potenza e cadenza (`#srcPower`, `#srcCadence`, elenchi veri: tieni + per prenderli). Il ruolo lo assegna `js/devices.js` dai servizi; solo Cycling Power chiede "rullo o misuratore?" una volta e lo ricorda (`devRoles` in localStorage). Fonti: `js/sources.js` (sensore dedicato > rullo > stima). Ricollegamento all'avvio: `devKnown` + `navigator.bluetooth.getDevices()`. Test: `tests/devices.spec.mjs`, `tests/fake-ble.js` (`__fakeBle.next` sceglie il dispositivo finto: trainer, click, hr, csc, cps, cps-csc).
