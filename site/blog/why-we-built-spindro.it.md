---
title: Perché abbiamo creato un'app gratuita per l'indoor cycling
description: Un rullo smart che hai già pagato e abbonamenti per tutto il resto. Perché abbiamo creato Spindro, cosa fa e i limiti che vogliamo farti conoscere prima di provarla.
date: 2026-11-15
order: 1
image: home
---
Hai comprato un rullo smart. Sa tenere una potenza, simulare una salita e parlare con il telefono via Bluetooth. Poi scopri che usarlo comodamente significa un altro pagamento mensile, e spesso un account, per un software che fa soprattutto una cosa: dire al rullo quanta resistenza applicare.

Spindro nasce tutta da qui. Volevamo usare il nostro rullo, con le nostre gambe, senza abbonamento. Così abbiamo scritto l'app che volevamo, e la pubblichiamo gratis.

## Cosa fa Spindro

Si collega al rullo via Bluetooth e lo controlla. La home ruota attorno all'ERG, la modalità in cui il rullo tiene la potenza che chiedi: un obiettivo in watt, un meno e un più, e il tasto Avvia. Se preferisci pedalare come su strada, il cambio virtuale offre 24 rapporti che scegli tu.

Sopra a questo ci sono le cose che servono a un'app di allenamento:

- **Allenamenti strutturati e piani.** 34 allenamenti da 24 a 90 minuti e quattro piani di più settimane, tutti in percentuale della tua FTP, quindi si adattano a te. Puoi crearne di tuoi, importare file `.zwo` ed esportare `.zwo` o un file di allenamento Garmin.
- **Giochi che sono allenamenti.** Sei giochi 3D, ciascuno una sessione da 5, 10 o 20 minuti con sforzi e recuperi. C'è [un articolo intero su come sono pensati](/it/blog/games-that-are-workouts/).
- **I tuoi dispositivi in un posto solo.** Un unico pulsante «Aggiungi dispositivo» abbina rullo, controller Zwift, fascia cardio, misuratore di potenza o sensore di cadenza, e l'app capisce qual è quale.
- **La traccia di ciò che hai fatto.** Storico, record di potenza, stima della FTP e caricamento facoltativo su Strava. Nell'app Android il telefono può anche trasmettere potenza, cadenza e velocità perché un orologio registri l'uscita.

![La home di Spindro: un giro libero in ERG con obiettivo 130 W.](shot:home)

## Cosa non fa

Preferiamo dirlo chiaramente piuttosto che te ne accorga in una fredda sera di martedì.

- **Non c'è un mondo online.** Niente multigiocatore, niente altri ciclisti, niente strade virtuali con persone vere. I giochi sono per un giocatore solo e un video YouTube scorre alla tua velocità ma non è un percorso.
- **È stata provata su un rullo solo.** Abbiamo provato davvero un rullo, un Van Rysel D100, e i tasti + e − di uno Zwift Click. Tutto il resto è costruito sulle specifiche pubbliche e provato con dispositivi simulati. La maggior parte dei rulli smart degli ultimi anni parla il protocollo Bluetooth standard per le macchine fitness (FTMS), quindi ci aspettiamo che molti funzionino, ma aspettarsi non è sapere. La [pagina di compatibilità](/it/compatibility/) dice esattamente cosa sappiamo.
- **Alcune cose sono sperimentali.** Il supporto ai protocolli Tacx e Wahoo più vecchi e ai controller Zwift Play e Ride è stato controllato solo con simulatori.
- **Su iPhone e iPad serve un altro browser.** Safari non permette il Web Bluetooth. Un browser che lo aggiunge, come Bluefy, dovrebbe funzionare, ma non l'abbiamo provato.

## Com'è fatta

Spindro è una web app statica: file JavaScript semplici, niente bundler, nessun nostro server da cui passino le tue uscite. L'app Android è lo stesso codice in un involucro Capacitor. Uscite, record e impostazioni restano sul tuo dispositivo; non c'è un account da creare. I dati escono dal dispositivo solo se scegli di usare Strava, guardare un video YouTube o esportare un file. Questo sito conta le visite in forma anonima, senza cookie, e l'app chiede il permesso prima di contare qualsiasi cosa.

Il codice è pubblico con licenza AGPL-3.0, il che significa che resta pubblico, anche nelle versioni modificate da altri.

## A proposito di abbonamenti

Le piattaforme di indoor cycling più note sono abbonamenti a pagamento. È un modo legittimo di finanziare un grande servizio con mondi dal vivo e server. Ma non è ciò che tutti vogliono pagare quando il rullo ce l'hanno già e vogliono solo seguire un allenamento. Spindro è uno scambio diverso: meno spettacolo, nessuna bolletta ricorrente. Zwift, Garmin, Strava, Tacx, Wahoo, Van Rysel e gli altri nomi citati sono marchi dei rispettivi proprietari e non siamo affiliati a nessuno di loro.

## Aiutaci a rendere la tabella onesta

La cosa più utile che puoi fare è pedalarci e dircelo. Se provi il tuo rullo, usa «Segnala il tuo rullo» nell'app o apri una segnalazione su GitHub con il modello, cosa ha funzionato e cosa no. Ogni segnalazione trasforma un «dovrebbe funzionare» della nostra tabella in qualcosa di reale. Se sai scrivere codice, c'è anche [una pagina su come creare un gioco](/it/developers/).

Apri la web app, collega il rullo, pedala. Ci vuole circa un minuto.
