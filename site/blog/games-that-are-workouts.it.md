---
title: Giochi che sono allenamenti
description: I sei giochi di Spindro seguono poche regole di design perché giocare sia allenarsi: sessioni in percentuale della FTP, tre livelli, qualcosa da fare ogni pochi secondi. E un invito a crearne uno.
date: 2026-11-15
order: 3
image: game-racer
---
Quasi tutti i giochi di ciclismo trattano i tuoi watt come un tachimetro. Spingi di più, vai più veloce. È un buon inizio, ma fa un allenamento povero: scatti finché sei stanco, poi smetti, e il gioco non ti ha insegnato nulla sul passo.

Noi abbiamo scelto l'opposto. In Spindro un gioco è prima di tutto un allenamento, e il gioco è il modo in cui l'allenamento viene raccontato.

## Una sessione, una forma

Ogni sessione ha una durata che scegli all'inizio: 5, 10 o 20 minuti. Dentro, l'intensità segue una curva: un avvio facile di circa un minuto, ondate di sforzo e recupero, un finale più duro e un defaticamento prima del riepilogo. Non chiediamo mai più di 90 secondi sopra la soglia senza almeno 40 secondi di recupero.

Tutto è espresso in **percentuale della tua FTP**. Il recupero sta attorno al 50–65%, il ritmo al 75–90%, uno sforzo al 95–110%, uno scatto al 130% o più per pochi secondi. Così lo stesso gioco è giusto per chi ha una FTP di 120 W e per chi ne ha 320. Quando nessun rullo è collegato, un ciclista dimostrativo simula 0,8 della FTP con qualche scatto, così puoi dare un'occhiata.

![Breakaway, il gioco della corsa a tappe: un obiettivo in salita al 90% della FTP mentre il gruppo corre di fianco.](shot:game-racer)

## Tre livelli e una difficoltà che si adatta

Facile, normale e difficile spostano le percentuali di circa il 10% in un senso o nell'altro. In più il gioco si adatta un poco: dopo due sforzi falliti di fila le richieste scendono del 5%, dopo tre riusciti salgono del 5%, entro un limite del 15% per parte. Lo scopo è tenerti nella zona in cui lo sforzo è duro ma non impossibile.

## Qualcosa da fare ogni pochi secondi

Un allenamento che è solo un numero sullo schermo annoia. Le regole sono severe:

- La prima cosa da fare compare entro otto secondi dall'inizio.
- Non passano mai più di cinque secondi senza un evento che chiede o premia qualcosa.
- C'è sempre un obiettivo visibile con una barra o un contatore, come «ondata 3 di 8» o «mancano 400 metri».
- Ogni azione ha una risposta entro 100 millisecondi: un suono, particelle, un numero che sale.
- Alla fine ricevi da una a tre stelle con criteri chiari, un record personale e un suggerimento per la stella successiva.

## Giocare dalla bici

Si deve poter giocare senza toccare lo schermo. Watt e cadenza fanno il grosso. I tasti + e − di un controller fanno una cosa sola per gioco, spiegata nel menu. Se smetti di pedalare il gioco va in pausa invece di punirti, e nessuno è penalizzato perché spinge più di quanto richiesto.

Tutti i giochi condividono lo stesso menu e la stessa schermata dei risultati, quindi ciò che impari in uno vale per il successivo.

![Il menu comune: durata, livello e un avvio che funziona con un tasto, un tocco o pedalando.](shot:gamemenu)

## Porta il tuo allenamento

Un gioco non deve per forza inventarsi la sua sessione. Quando avvii uno degli allenamenti di Spindro e da lì apri un gioco, il gioco segue l'allenamento: ogni passo diventa parte del gioco, e i tratti costanti più lunghi di tre minuti vengono divisi in ondate da uno o due minuti allo stesso obiettivo, così restano eventi e un contatore. In questa modalità i watt li decide l'allenamento, quindi livello e difficoltà adattiva non li toccano. Anche le stelle cambiano: una per aver finito, due per essere rimasti entro il 7% dall'obiettivo per almeno il 60% del tempo, tre per almeno l'85%.

## I sei giochi

Breakaway è una tappa a tempo con una fuga, una volata e una salita che carica il tuo rullo. Horde Run tiene una strada contro ondate di zombie. Pedal Strike è uno sparatutto a corsa i cui scudi si rompono solo ai watt giusti. Slipstream ti chiede di raggiungere i corridori che attaccano e di portarli nella tua scia. Updraft è un aereo la cui quota è la tua potenza. Feed Zone fa rimbalzare una borraccia sui massaggiatori, con la cadenza che ne decide la velocità.

## Come si controlla un gioco

Le nostre regole dicono che un gioco non è finito perché è bello da vedere. Va verificato con un bot a quattro livelli di potenza, 0,6, 0,8, 1,0 e 1,2 volte la FTP, su una sessione di cinque minuti a livello normale, registrando le stelle ottenute, il tempo al primo evento, l'intervallo più lungo senza eventi e gli eventi al minuto. Il risultato atteso è una stella a 0,6 volte la FTP e tre a 1,2 volte. Le regole chiedono anche strisce di fotogrammi di gioco vero, guardate da una persona, per scovare i difetti visivi: oggetti che compaiono di colpo vicino alla camera, modelli che si attraversano, sfarfallii.

Tutto questo usa rulli simulati. Non possiamo dirti come gira un gioco sul tuo telefono, e la resa grafica dipende dalla sua scheda.

## Creane uno

I giochi sono piccoli moduli JavaScript su un kit comune che fornisce menu, risultati, HUD, ciclista, ambiente e qualità grafica. Se hai un'idea per un gioco che funzioni come allenamento, la pagina [Crea un gioco](/it/developers/) mostra i tre passi: copia il gioco modello, aggiungi una voce al registro, aggiungi le tue stringhe. La guida porta in circa 15 minuti da un clone nuovo al tuo gioco sullo schermo, e un bot lo fa giocare a quattro livelli di potenza e ti dice quale regola non rispetta. Ci piacerebbe vedere il tuo.
