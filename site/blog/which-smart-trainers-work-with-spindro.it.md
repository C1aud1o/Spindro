---
title: Quali rulli smart funzionano con Spindro
description: I rulli smart supportati da Spindro per protocollo (FTMS, Tacx FE-C, Wahoo legacy), quale è verificato su hardware vero, quali dovrebbero solo funzionare e perché l'iPhone non è supportato.
date: 2026-11-18
order: 7
kind: guide
image: devices
---
Spindro, l'app gratuita di indoor cycling, funziona con i rulli smart tramite protocolli Bluetooth standard e non con un elenco di modelli. Questa pagina elenca i rulli che conosciamo e dice onestamente quanto siamo sicuri di ciascuno. L'elenco qui sotto è generato dagli stessi dati della [pagina di compatibilità](/it/compatibility/), quindi le due coincidono sempre.

:::compat-count

«Verificato» significa che abbiamo pedalato davvero con quel rullo. «Dovrebbe funzionare» significa che il protocollo è realizzato e provato con un rullo simulato, ma nessuno ha ancora provato quel modello con Spindro. Se provi il tuo, [scrivici](https://github.com/C1aud1o/Spindro/issues): le segnalazioni fanno crescere questo elenco.

![La scheda Dispositivi con un rullo collegato.](shot:devices)

## Come etichettiamo un rullo

Usiamo quattro parole e cerchiamo di non piegarle. **Verificato**: provato da noi sul dispositivo vero. **Parzialmente verificato**: alcune funzioni sono state provate sul dispositivo vero, le altre no. **Dovrebbe funzionare**: il protocollo è supportato dal codice ma quel modello non è mai stato provato. **Segnalato**: gli utenti ci hanno detto che funziona. Oggi un modello sale di livello solo quando qualcuno ci ha pedalato davvero, e nulla è «verificato» sulla base di una scheda tecnica.

Spindro sceglie il protocollo da solo: prima FTMS, poi Tacx FE-C via Bluetooth, poi Wahoo legacy, poi Cycling Power o Velocità e Cadenza in sola lettura. Non lo scegli tu e non serve conoscerlo, ma spiega perché anche un rullo che non hai mai sentito nominare può collegarsi.

## FTMS

FTMS è lo standard Bluetooth per le macchine fitness e la maggior parte dei rulli smart recenti lo parla. Spindro lo prova per primo. Un rullo che annuncia FTMS dovrebbe collegarsi e si può controllare in ERG, pendenza e resistenza.

:::compat FTMS

## Tacx FE-C via Bluetooth

Alcuni rulli Tacx, compresi modelli senza FTMS, parlano FE-C, il protocollo usato da Tacx, via Bluetooth. Spindro lo supporta come ripiego. Lo abbiamo provato solo con un rullo simulato, non su un Tacx vero.

:::compat Tacx FE-C over BLE

## Wahoo legacy

I rulli Wahoo più vecchi, e quelli recenti con firmware vecchio, usano il protocollo di controllo di Wahoo. Spindro lo supporta come ripiego, provato solo con un rullo simulato.

:::compat Wahoo legacy

## Sola lettura: misuratori di potenza e sensori

Se un dispositivo offre solo Cycling Power o Velocità e Cadenza, Spindro lo legge ma non può cambiare la resistenza. La resistenza la imposti sul rullo stesso.

:::compat Cycling Power / Speed & Cadence

## iPhone e iPad

Oggi Spindro non funziona su iPhone e iPad, con nessun browser. Ogni browser iOS usa il motore di Apple, che non ha il Web Bluetooth, e non esiste un'app Spindro per iOS. Un browser che aggiunge il Web Bluetooth, come Bluefy, dovrebbe funzionare, ma non l'abbiamo provato. La soluzione semplice è un telefono Android o un computer con Chrome o Edge.

## Prima di collegare

Un rullo accetta una sola connessione Bluetooth per volta, quindi chiudi prima l'app del produttore, Zwift o qualunque altra app di allenamento. La [guida sul D100 senza Zwift](/it/blog/van-rysel-d100-without-zwift/) accompagna passo passo l'unico rullo che abbiamo provato. Per usare uno Zwift Click come cambio, leggi [usare un Click senza Zwift](/it/blog/zwift-click-without-zwift/). Tutto è gratis: vedi [cosa fa e cosa non fa l'app gratuita](/it/blog/free-smart-trainer-app-no-subscription/).
