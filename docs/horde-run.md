# Horde Run: come è fatta la partita

Codice: `js/games/horde.js` (gioco e grafica), `js/games/horde-plan.js` (la forma dell'allenamento, senza grafica),
`js/games/horde-world.js` (cimitero al crepuscolo). Regole generali: `docs/giochi-design.md`.

## La partita è un allenamento
Si sceglie la durata con **−** (5 / 10 / 20 min) e il livello con **+** (Facile −10 %, Normale, Difficile +10 %).
Si inizia pedalando (o tenendo premuto + o − per 0,8 s). Tutti i watt richiesti sono **% della FTP** (`hooks.ftp()`).

| Tratto | % FTP | Che cosa succede |
|---|---|---|
| Avvio | 62 % | 50 s, pochi zombi, i primi entro 1–3 s |
| Ritmo | 76 → 88 % | arriva l'ondata (mix diverso a ogni ondata) |
| Sforzo | 95 → 106 % | l'orda si infittisce |
| Scatto | 130 % per 10 s | solo con il Custode: se tieni i watt scatta l'OVERDRIVE (colpi doppi che trapassano) |
| Recupero | 56 % | pochi nemici, portali e gemme |
| Defaticamento | 50 % | 30 s, riepilogo con le stelle |

Ondate: 4 (5 min), 7 (10 min), 12 (20 min). Il Custode arriva a fine di ogni blocco di 4 ondate e nell'ultima.
Mix a rotazione: camminatori in massa, corridori, bruti, scheletri (schivano i colpi).
Uno **sforzo** è riuscito se per il 65 % del tempo (scatto: 50 %) tieni almeno il 92 % dei watt richiesti.
Adattamento: due sforzi falliti di fila → richieste −5 %, tre riusciti → +5 %, entro ±15 %.

## Comandi
- Watt → cadenza di tiro: `colpi/s = base dell'arma × clamp(watt / (0,8 × FTP), 0,35, 1,8)`.
- **+ / −** sterzano (tocco = scatto laterale, tenuto = sterzata continua). Servono per scegliere il portale e raccogliere le file di gemme.
- Smetti di pedalare per 2,5 s → **pausa** (il tempo si ferma). Non c'è game over: se finisci i cuori hai una *caduta*
  (l'orda si ritira, ti rialzi con 4 cuori) e conta solo per le stelle.

## Portali
Ogni 13–17 s una coppia di scelte diverse: alleato o arma, cadenza o danno, alleato o vita, ×2 alleati o danno…
Tra i due portali resta un varco. Le armi sono 10 e salgono anche con le uccisioni (la soglia cresce con la durata).

## Stelle
★ finita · ★★ almeno metà degli sforzi · ★★★ almeno l'80 %, tutti i Custodi battuti, al massimo 3 cadute.
Il riepilogo dice che cosa manca alla stella dopo. Record per durata e livello in `localStorage` (`hordeBest2:<s>:<livello>`).

## Come si tara (se cambi qualcosa)
Il regista (`directorTick`) dà i nemici al secondo per tratto (`BASE_RATE`), cresce con il tempo e con la forza della squadra
(`strength()`), e ha una *pressione* che scende quando ti colpiscono e risale piano. Le manopole sono in cima a `horde.js`
(`FIRE_RANGE`, `SPAWN_Z`, `BASE_RATE`, `PAIRS`) e nel mix di `horde-plan.js` (`COMPOS`).
Dopo ogni modifica: `npx playwright test tests/b5-games.spec.mjs` stampa la tabella del bot a 4 livelli di potenza
(stelle, tempo al primo evento, intervallo più lungo senza eventi, eventi al minuto, nemici entro 40 m).

## Difetti in movimento corretti
Vedi il riepilogo del lavoro (strisce in `docs/giochi-shots/horde-striscia-*.png`).
