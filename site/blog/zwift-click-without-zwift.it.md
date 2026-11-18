---
title: Usare uno Zwift Click (o Play, Ride) senza Zwift
description: Come usare uno Zwift Click, Play o Ride come cambio e telecomando gratuito per il rullo smart senza l'app Zwift: cosa funziona, cosa abbiamo provato su un Click vero, come verificare i tasti e i limiti.
date: 2026-11-18
order: 5
kind: guide
image: keycheck
---
Lo Zwift Click è un piccolo controller Bluetooth con i tasti + e −. Si può usare senza Zwift, come cambio e telecomando per Spindro, un'app gratuita e open source di indoor cycling. Funziona senza account Zwift, senza l'app Zwift e senza alcuna connessione ai server di Zwift. In teoria lo stesso vale per Zwift Play e Zwift Ride. Questa pagina dice cosa abbiamo davvero provato, che è meno dell'intero controller.

![La verifica tasti: mostra quale tasto riceve l'app da uno Zwift Click.](shot:keycheck)

## Cosa abbiamo provato su hardware vero

Solo i **tasti + e − di un Click v2** sono stati usati su un dispositivo vero, un Click arrivato con un Van Rysel D100. Funzionano. Le frecce e i tasti A, B, Y e Z seguono tabelle open source e non sono confermati. Zwift Play e Zwift Ride sono stati scritti a partire da progetti open source e provati solo con dispositivi simulati.

Quindi: usa i tasti + e − con fiducia, considera tutto il resto «dovrebbe funzionare, ma controlla».

## Cosa fanno i tasti

- Nel **cambio virtuale**, + sale di rapporto e − scende.
- In **ERG**, + e − cambiano l'obiettivo di potenza di 5 W.
- Durante un **allenamento**, alzano o abbassano l'intensità del 5%.
- **Nei menu**, le frecce si spostano, A seleziona e B torna indietro, così non devi toccare il telefono sul manubrio. Quei tasti sono fra quelli non confermati.
- Premere + e − insieme apre il menu del controller.

## Collegalo

Usa lo stesso pulsante **Aggiungi dispositivo** del rullo. Un solo pulsante collega ogni modello: Spindro cerca un dispositivo Bluetooth che si chiami Zwift o che offra il servizio dei controller Zwift. Premi un tasto una volta, così l'app capisce di che modello si tratta.

Un rullo che espone anche il servizio Zwift, come il D100, viene trattato come rullo e mai come controller. Il Click è un dispositivo a parte.

## La verifica tasti

Poiché la maggior parte dei tasti non è confermata, Spindro include una **verifica tasti**. Apri **Dispositivi** e tocca **Controlla il tuo controller**, oppure trovala nel menu del controller. Premi un tasto e si accende a schermo, così vedi cosa riceve l'app. Puoi associare un tasto a un ruolo (+, −, su, giù, seleziona, indietro, nessuno) e l'app produce un breve rapporto che puoi inviarci. È così che un tasto non confermato diventa confermato.

## Limiti e cosa può andare storto

- **Firmware cifrato.** Alcune versioni del firmware di Play e Ride cifrano i messaggi dei tasti. Lo scambio cifrato non è realizzato, quindi su quelle i tasti possono non fare nulla. Se succede, usa i pulsanti a schermo.
- **Play sinistro e destro.** I due controller Play inviano gli stessi campi, quindi l'app non li distingue e dà a entrambi gli stessi ruoli.
- **Click v1.** Non l'abbiamo provato.
- **App Android e due controller insieme** non sono stati provati su hardware vero.
- **I nomi sono di Zwift.** Zwift, Click, Play e Ride sono marchi dei rispettivi proprietari. Spindro non è affiliato a Zwift, non usa codice Zwift e parla con il controller solo via Bluetooth.

Il supporto a questi controller nasce da lavoro open source sul protocollo Bluetooth, usato perché l'hardware che possiedi funzioni con un'app gratuita.

## Domande

### Posso usare uno Zwift Click senza Zwift?

Sì, in Spindro. Non servono un account Zwift né l'app Zwift. Abbiamo provato i tasti + e − di un Click v2 su un dispositivo vero.

### Zwift Play e Zwift Ride funzionano?

Sono realizzati ma provati solo con dispositivi simulati. Alcuni firmware cifrano i tasti, cosa che Spindro non supporta.

### Quali tasti sono confermati?

Solo + e − di un Click v2. Usa la verifica tasti nell'app per vedere cosa inviano gli altri.
