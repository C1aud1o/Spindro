---
title: Van Rysel D100 (Decathlon) senza Zwift: l'app gratuita
description: Un'app gratuita per il rullo smart Van Rysel D100: collegalo via Bluetooth, pedala in ERG o con il cambio virtuale, calibra la cadenza e scopri cosa abbiamo provato sul rullo vero. Senza Zwift e senza abbonamento.
date: 2026-11-18
order: 4
kind: guide
image: devices
---
Il Van Rysel D100 è il rullo smart venduto da Decathlon, e molti di chi lo possiede cercano un'app che non richieda Zwift né un abbonamento. Spindro è un'app gratuita e open source pensata proprio per questo rullo: è l'unico che abbiamo provato su hardware vero. Questa pagina dice cosa abbiamo controllato, come collegarlo e l'unica cosa che il D100 fa in modo diverso.

![La scheda Dispositivi con un Van Rysel D100 collegato.](shot:devices)

## Cosa abbiamo provato

Abbiamo pedalato con un D100 vero e controllato collegamento, cambio virtuale, ERG e modalità pendenza. Hanno funzionato. Qui finisce quello che affermiamo: un rullo, la configurazione di una persona. Se il tuo si comporta in modo diverso, scrivici.

Il D100 parla FTMS, lo standard Bluetooth per le macchine fitness: non c'è niente di speciale da installare e nessun account da creare.

## Collegalo in quattro passi

1. Chiudi ogni altra app che usa il rullo (l'app di Decathlon, Zwift, un'altra scheda del browser). Un rullo parla con una sola app per volta.
2. Sveglia il rullo con qualche pedalata, in modo che la spia si accenda.
3. Apri [la web app](/app/) in Chrome o Edge, oppure l'app Android, e tocca **Collega il rullo**. Android chiede una volta il permesso «Dispositivi nelle vicinanze».
4. Scegli la voce che contiene Van Rysel o D100. I watt compaiono subito.

Se l'elenco è vuoto, tieni il telefono entro due metri e controlla che nient'altro sia collegato al rullo. I dispositivi già noti si ricollegano da soli dove la piattaforma lo permette.

## Il D100 non trasmette la cadenza

A differenza di molti rulli, il D100 non comunica la cadenza. Spindro la stima dalla velocità del volano, con un fattore ricavato da dati del D100. Quel fattore dipende da corona e pignone, quindi conviene calibrarlo una volta: nelle **Impostazioni** la calibrazione tiene una resistenza leggera mentre pedali a tempo con un segnale acustico, e fa una misura. Se hai un sensore di cadenza, o un misuratore di potenza che la trasmette, viene usato il valore vero e non serve la stima.

## Perché l'app ripete l'obiettivo di potenza

Il D100 sembra fissare la resistenza per la potenza richiesta alla velocità del momento. Se acceleri, la resistenza resta dov'era finché non arriva un nuovo comando. Per questo in ERG l'app rimanda l'obiettivo circa ogni due secondi, anche se non è cambiato. Il risultato è che i watt restano vicini all'obiettivo mentre la cadenza varia. Il dettaglio tecnico è nel [nostro articolo su ERG e cambio virtuale](/it/blog/virtual-gears-and-erg/).

## Scegli una modalità

- **ERG:** il rullo tiene i watt che imposti. Ideale per gli allenamenti. [Di più sull'ERG nel browser](/it/blog/free-erg-workouts-in-the-browser/).
- **Cambio virtuale:** 24 rapporti che cambi tu.
- **Pendenza:** il rullo imita una salita, per i percorsi.

## Uno Zwift Click con il D100

Lo Zwift Click che abbiamo provato era arrivato con un D100. Abbiamo usato i suoi tasti + e − su hardware vero: in ERG cambiano l'obiettivo di 5 W, nel cambio virtuale cambiano rapporto. Gli altri tasti non li abbiamo confermati. [Usare un Click senza Zwift](/it/blog/zwift-click-without-zwift/).

## Limiti

Abbiamo provato un D100. Non abbiamo provato ogni versione del firmware e non possiamo promettere che l'app si comporti allo stesso modo su tutte. Spindro non è affiliato a Decathlon né a Van Rysel e non ha un mondo online: non c'è il multigiocatore. Per gli altri rulli vedi [quali rulli funzionano con Spindro](/it/blog/which-smart-trainers-work-with-spindro/) e la [pagina di compatibilità](/it/compatibility/).

## Domande

### Il Van Rysel D100 funziona senza Zwift?

Sì. È un rullo FTMS standard e Spindro lo controlla direttamente via Bluetooth. Abbiamo provato collegamento, cambio virtuale, ERG e pendenza su un D100 vero.

### Perché la cadenza è sbagliata o manca?

Il D100 non trasmette la cadenza. Spindro la stima dalla velocità del volano: calibrala nelle Impostazioni, oppure collega un sensore di cadenza.

### Posso usarlo da iPhone?

Non in Safari, che non ha il Web Bluetooth. Usa un telefono Android o un computer con Chrome o Edge.
