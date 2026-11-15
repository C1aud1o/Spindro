# Slipstream: come è fatta la partita

Codice: `js/games/gruppetto.js` (gioco, grafica, interfaccia; id `gruppetto`), `js/games/slip-plan.js` (la forma
dell'allenamento e le regole di "ponte", senza grafica), `js/games/slip-world.js` (strada, campi, oggetti lungo il percorso).
Durate, livelli, adattamento e stelle seguono `docs/giochi-design.md`; il piano riusa `Adapter`, `segAt`, `targetW` di `horde-plan.js`.

## L'idea
Sei su una strada di campagna a tre corsie. Davanti a te un corridore **scatta**: lo raggiungi con i watt (i metri che mancano
sono sulla barra), e quando lo prendi entra nella tua scia. **Il gruppo dietro di te è il punteggio.**
Nel vento contro devi tenere i watt, altrimenti chi è in scia si stacca. Nessuna sconfitta: se un ponte non riesce, quel corridore
se ne va e ne arriva un altro; chi smette di pedalare va in pausa (il tempo si ferma).

## La partita è un allenamento
Durata con **−** (5 / 10 / 20 min), livello con **+** (Facile −10 %, Normale, Difficile +10 %), si parte pedalando o tenendo premuto + / −.
Tutti i watt sono **% della FTP** (`hooks.ftp()`). Senza rullo la demo simula 0,8 × FTP con scatti e guida la corsia da sola.

| Tratto | % FTP | Che cosa succede |
|---|---|---|
| Avvio (50 s) | 62 % | il primo corridore è già a 18 m (si vede nel menu): da prendere entro 30 s. Bidoni da raccogliere |
| Tieni (vento contro) | 76 → 88 % | chi è in scia resta solo se tieni ≥ 90 % dei watt richiesti; intanto il prossimo corridore nasce nella nebbia e si avvicina |
| Ponte (sforzo) | 95 → 106 % | il corridore (o un drappello, 1 → 3) scatta a 20 m: chiudi la distanza entro la fine del tratto |
| Volata | 130 % per 10 s | a fine blocco (ogni 4 ondate) e in finale: un drappello davanti e il traguardo (arco Meshy) |
| Recupero | 56 % | il gruppo resta unito a watt facili, bidoni da raccogliere |
| Defaticamento (30 s) | 50 % | riepilogo con le stelle |

Ondate: 4 (5 min), 7 (10 min), 12 (20 min). Mai più di 90 s sopra soglia di fila (verificato nel test).
Adattamento: due ponti falliti di fila → richieste −5 %, tre riusciti → +5 %, entro ±15 %.

## Come si chiude un ponte
- `closingSpeed(watt, richiesti, ftp, gap0, durata)`: a watt richiesti il gap (20 m) si chiude in 70 % della durata del tratto;
  sotto metà FTP non si recupera nulla; tetto a 1,6 × (nessun premio infinito).
- A **3 m** (una bici di distanza: niente modelli che si attraversano) il corridore è preso **solo se sei nella sua corsia**;
  altrimenti il gap si ferma e compare la freccia ◀ / ▶. A metà ponte il corridore cambia corsia una volta.
- Ponte riuscito: entra in scia (colonne ai due lati, file da due; il nuovo sta davanti, gli altri scorrono indietro; nel menu
  e a 390×780 se ne vedono 4–6, gli altri stanno dietro la camera e contano nel numero GRUPPO).
- Ponte fallito: il corridore accelera e sparisce nella nebbia (nasce e muore oltre i 110 m, mai vicino alla camera).

## Comandi
**+ / −** cambiano corsia (una cosa sola): servono per prendere il corridore e per i bidoni (+10 + 2 per ogni corridore in scia).
Nel menu: − cambia la durata, + cambia il livello, pressione lunga di + inizia (come Horde Run).

## Eventi (si misurano nel test)
Sempre qualcosa da fare: ogni 2,8 s un *controllo del ritmo* (in zona: punti ∝ gruppo; sotto: "più watt"), file di bidoni ogni ~3 s
nei tratti senza sforzo, nascita del corridore, avvicinamento, scatto, cambio di corsia, preso, staccato, traguardo.

## Stelle
★ finita · ★★ almeno metà dei ponti (volate comprese) · ★★★ almeno l'80 %, volata finale vinta, al massimo 3 corridori persi.
Il riepilogo dice che cosa manca alla stella dopo. Record per durata e livello in `localStorage` (`slipBest:<s>:<livello>`).

## Come si tara
Le manopole sono in `slip-plan.js` (`BASE_PCT`, `MARGIN`, `CLOSE_MAX`, `HOLD_PCT`, `DROP_AFTER`, forma del piano) e in cima a
`gruppetto.js` (camera `CAM_*`, gap, file del gruppo). Prova: `tests/slip.spec.mjs` (bot a 0,6 / 0,8 / 1,0 / 1,2 × FTP con caso fisso).
