# Giochi: regole di design (valgono per tutti)

Scritto dopo due giri di prove su telefono: i giochi avevano difetti grafici, il gameplay non coinvolgeva e la
difficoltà non era tarata. La grafica nuova non basta. Queste regole si misurano: un gioco è finito solo se le rispetta
tutte, con i numeri nel riepilogo.

## Nomi (uguali in tutte le lingue)
| id nel codice | nome | in una riga |
|---|---|---|
| `racer` | **Breakaway** | gara a tappe: scia, salite, volata |
| `horde` | **Horde Run** | tieni la strada contro l'orda: più watt, più colpi |
| `gruppetto` | **Slipstream** | raccogli i corridori e portali nella tua scia |
| `planata` | **Updraft** | aereo a pedali: i watt sono la quota |
| `mattoni` | **Feed Zone** | rimbalzi a tema ciclismo: la cadenza è la velocità |
| `shooter` | **Pedal Strike** | sparatutto a scorrimento: il gioco di punta |

## 1. Ogni partita è un allenamento con una forma
- La partita ha una durata scelta all'inizio: **5, 10 o 20 minuti** (pressione di + / − nel menu del gioco).
- L'intensità segue una curva: 45–60 s di avvio facile, poi **ondate di sforzo e recupero**, un finale più duro, 30 s
  di defaticamento con il riepilogo. Mai più di 90 s di sforzo sopra soglia senza un recupero di almeno 40 s.
- Tutto è in **percentuale della FTP** del giocatore (`hooks.ftp()` o come il gioco la riceve oggi): recupero 50–65 %,
  ritmo 75–90 %, sforzo 95–110 %, scatto 130 %+ per 5–15 s. Con il rullo non collegato la demo simula 0,8 × FTP con
  scatti. Così il gioco è giusto per chi ha 120 W di FTP e per chi ne ha 320.
- **Tre livelli** (Facile −10 %, Normale, Difficile +10 % sulle percentuali) e **difficoltà che si adatta**: dopo due
  sforzi falliti di fila le richieste scendono del 5 %, dopo tre riusciti salgono del 5 % (entro ±15 %).

## 2. Deve succedere sempre qualcosa
- **Entro 8 secondi** dall'inizio c'è la prima cosa da fare (un nemico, un corridore, un bersaglio).
- Mai più di **5 secondi** senza un evento che chiede o premia qualcosa.
- C'è sempre **un obiettivo visibile** con una barra o un contatore ("ondata 3/8", "mancano 400 m", "5 corridori su 8").
- Ogni azione ha una risposta entro 100 ms: suono, particelle, numero che sale, piccola scossa della telecamera.
- Fine partita: **da 1 a 3 stelle** con criteri chiari, record personale, una cosa sbloccata o un passo verso la prossima.

## 3. Comandi da bici
- Si gioca **senza toccare lo schermo**: i watt e la cadenza fanno il grosso; + / − (Zwift Click) fanno una sola cosa
  per gioco, spiegata in una riga nel menu. Pressione lunga di − = pausa (già gestita dall'app).
- Niente punizioni per chi spinge di più. Niente "game over" nel primo minuto. Chi smette di pedalare va in pausa,
  non perde.

## 4. Si deve vedere bene
- Il personaggio occupa **almeno il 14 % dell'altezza** dello schermo a 390×780; nemici e bersagli importanti almeno l'8 %.
- Niente metà schermo vuota: la telecamera inquadra l'azione, non l'asfalto.
- Scritte con il sistema comune (`js/games/kit/hud.js`): niente sovrapposizioni, niente testo fuori schermo, numeri
  leggibili da un metro.
- **Niente difetti in movimento**: nessun oggetto che compare di colpo vicino alla telecamera, nessun modello che
  attraversa un altro, nessuno sfarfallio di superfici sovrapposte, animazioni senza scatti, nessun personaggio
  "congelato" o che scivola senza muovere le gambe.

## 5. Come si verifica (obbligatorio, con i numeri nel riepilogo)
1. **Bot di gioco** in Playwright a quattro livelli di potenza: 0,6 × / 0,8 × / 1,0 × / 1,2 × FTP (FTP 200), partita da
   5 minuti a livello Normale. Per ognuno: stelle ottenute, tempo al primo evento, intervallo più lungo senza eventi,
   eventi al minuto. Atteso: 0,6 × finisce la partita con 1 stella; 0,8 × → 1–2; 1,0 × → 2–3; 1,2 × → 3.
2. **Filmato**: registra 20 s di gioco pieno con `recordVideo` di Playwright (o fotogrammi a 10 al secondo), a 390×780,
   estrai una striscia di 12 fotogrammi consecutivi e GUARDALA cercando i difetti del punto 4. Ripeti dopo ogni
   correzione. Salva le strisce finali in `docs/giochi-shots/<gioco>-striscia-*.png`.
3. **Prestazioni**: tempo medio per fotogramma con CPU rallentata 4× a qualità media sotto 22 ms, o qualità automatica
   che scende da sola.
4. Test esistenti verdi: `npm test`, `node tests/i18n-check.mjs`, `node tests/trainers/run.mjs`,
   `node tests/controllers/zwift-controllers.test.cjs`.

Nota per chi verifica: nello script di prova passare a `game.input()` solo `+1` o `-1`. Un valore diverso rompe la
posizione del giocatore e lo schermo diventa nero: è un errore della prova, non del gioco.
