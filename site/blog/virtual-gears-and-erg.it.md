---
title: Come funzionano cambio virtuale ed ERG su un rullo economico
description: Cos'è FTMS in parole semplici, cosa fa l'ERG, perché l'app rinvia l'obiettivo di potenza ogni due secondi su certi rulli, come si stima la cadenza dal volano e cosa aggiunge un controller.
date: 2026-11-15
order: 2
image: ride
---
Un rullo smart è un volano con un freno e una radio. Al freno si può dire cosa fare. Questo articolo spiega come glielo dice Spindro, usando le parti di codice che fanno il lavoro, così che ogni affermazione si possa controllare nel repository.

## FTMS in parole semplici

La maggior parte dei rulli recenti parla FTMS, lo standard Bluetooth per le macchine fitness. Funziona come un piccolo linguaggio comune a due sensi.

Il rullo *riferisce*: manda un flusso di «dati bici indoor» con velocità, potenza e, se ce l'ha, cadenza. L'app *comanda*: scrive in un punto di controllo. Il primo comando è sempre la richiesta di controllo; se il rullo la concede, l'app può inviare poche istruzioni semplici. Spindro ne usa tre:

- **Imposta la potenza obiettivo** (ERG): «fai in modo che chi pedala produca questi watt».
- **Imposta i parametri di simulazione** (modalità pendenza): «fai finta che la strada abbia questa pendenza».
- **Imposta la resistenza obiettivo**: «applica questa percentuale dell'escursione del freno».

Il rullo pubblica anche cosa supporta e i limiti del suo campo di potenza, che l'app legge al collegamento. Se un rullo non ha il punto di controllo è in sola lettura: Spindro mostra i numeri e non può cambiare nulla.

## Cosa fa l'ERG

In ERG il rullo tiene una potenza. Chiedi 150 W e il freno si regola in modo che, qualunque cosa tu faccia con le gambe, produca circa 150 W: se pedali più veloce la resistenza scende, se pedali più piano sale. Per questo un allenamento in ERG è costante, e per questo è la modalità di partenza nella home. L'obiettivo predefinito è il 60% della tua FTP, o l'ultimo valore scelto.

![La schermata di uscita in ERG: 139 W con obiettivo 140 W.](shot:ride)

## Perché l'obiettivo viene rinviato ogni due secondi

Alcuni rulli, e il Van Rysel D100 che usiamo è uno di questi, sembrano fissare la resistenza per la potenza richiesta alla velocità del momento e non la ricalcolano finché non ricevono un nuovo comando. Se acceleri, la resistenza resta dov'era e la potenza si allontana dall'obiettivo.

Così l'app ripete il comando circa ogni due secondi anche se il valore non è cambiato. In concreto, il ciclo principale da un secondo azzera la memoria dell'«ultimo inviato» quando sono passati più di 1,8 secondi, e al giro successivo l'obiettivo viene rimandato. Il costo è qualche scrittura Bluetooth. Il vantaggio è che la resistenza segue la cadenza e i watt restano sull'obiettivo. Un test nel repository verifica che lo stesso valore venga rinviato col passare del tempo.

## Il cambio virtuale

La modalità a marce imita una bici. Ci sono 24 rapporti, distribuiti in modo geometrico da 0,75 a 5,5. L'app calcola una velocità virtuale dalla cadenza, dal rapporto e dalla circonferenza della ruota di 2,105 m (una gomma 700x25c), poi chiede a un piccolo modello fisico quale potenza serve a quella velocità: gravità sulla pendenza, resistenza al rotolamento, resistenza dell'aria e una piccola perdita di trasmissione, usando la tua massa. La risposta viene inviata come potenza obiettivo. Se sali di marcia la stessa cadenza richiede più watt; se scendi, meno.

Per non intasare il Bluetooth, l'app invia un nuovo obiettivo solo quando cambia di almeno 3 W e non più spesso di circa una volta al secondo. L'impostazione «durezza» scala il risultato fra il 40% e il 100% se le marce sono troppo dure. Il cambio automatico, facoltativo, cambia una marcia alla volta se la cadenza resta a più di 6 giri/min dall'obiettivo per tre secondi.

## La cadenza dal volano

Non tutti i rulli mandano la cadenza, e il D100 non la manda. Ma su un rullo con trasmissione fissa la velocità del volano è proporzionale alla pedalata, quindi l'app stima la cadenza come velocità in km/h per un fattore. Il fattore predefinito è 7,37 giri/min per km/h, preso dai dati del D100. Dipende dalla corona e dal pignone che usi, quindi va misurato.

È ciò che fa la calibrazione nelle Impostazioni. Il rullo tiene una resistenza leggera e costante (90 W) mentre pedali a tempo con un metronomo a 85 giri/min. L'app aspetta sei secondi che tu prenda il ritmo, poi misura per 15 secondi e prende la velocità mediana, che ignora una pedalata fuori tempo. Il nuovo fattore è 85 diviso quella velocità. Se hai un vero sensore di cadenza, la cadenza misurata prende il posto del metronomo. Se un misuratore di potenza, un sensore di cadenza o il rullo stesso mandano la cadenza vera, la stima non si usa affatto.

## Cosa aggiunge un controller

Cadenza e watt dicono all'app cosa fai con le gambe. Un controller fa parlare anche le mani. Uno Zwift Click ha i tasti + e −: in modalità a marce cambiano marcia su e giù; in ERG cambiano l'obiettivo di 5 W, e durante un allenamento alzano o abbassano l'intensità del 5%. L'app può anche usare i tasti per muoversi nei menu, quindi non serve toccare il telefono sul manubrio.

Siamo prudenti su ciò che affermiamo. Solo i tasti + e − di un Click v2 sono stati usati su hardware vero. Gli altri tasti sono associati da tabelle open source, quindi l'app include una verifica tasti: mostra quale tasto riceve, ti lascia associarlo e produce un breve rapporto che puoi inviarci.

![La verifica tasti: mostra quale tasto riceve l'app da uno Zwift Click.](shot:keycheck)

## Limiti

Tutto questo è stato provato su un rullo solo. Altri rulli possono comportarsi in modo diverso, per esempio rispondendo in modo diverso ai comandi di controllo o ignorandone alcuni. Se il tuo fa qualcosa di strano, dicci: l'app ha una segnalazione che include il registro tecnico. Il codice è in `js/ftms.js`, `js/gears.js` e `js/calibrate.js`, abbastanza breve da leggerlo in una sera.
