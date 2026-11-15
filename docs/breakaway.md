# Breakaway: come funziona la tappa

Gara a tappe con 8 corridori. La partita è un **allenamento in % della FTP** di chi gioca: vale per chi ha 120 W come per chi ne ha 320.
Regole generali: `docs/giochi-design.md`. Codice: `js/games/racer-sim.js` (logica, senza three.js) e `js/games/racer3d.js` (scena, camera, scritte).

## Durata e livello
- **5, 10 o 20 minuti** (nel menu: − cambia la durata, + parte; i tasti si possono anche toccare). 5 min = Litorale al tramonto, 10 min = Colline d'autunno, 20 min = Passo delle nuvole.
- La gara dura la durata meno 30 s: gli ultimi **30 s sono il defaticamento** (podio e riepilogo, il rullo torna in piano).
- **Facile / Normale / Difficile** = −10 % / 0 / +10 % su tutte le percentuali (ritmo del gruppo e obiettivi). Adattamento: dopo due sforzi falliti di fila −5 %, dopo tre riusciti +5 % (entro ±15 %), salvato per la tappa dopo.

## I momenti (annunciati ~10 s prima, con la scheda in alto)
| Momento | Cosa fare (Normale) | Cosa succede |
|---|---|---|
| Partenza in gruppo | restare nel gruppo, 70–85 % FTP | in scia servono il 22 % di watt in meno |
| **Fuga** | 105 % FTP per 40 s | due rivali attaccano, il gruppo lascia andare poi insegue |
| Recupero | 55–65 % FTP, in scia | il gruppo si ricompatta |
| **Traguardo volante** | scatto 130 % FTP per 10 s negli ultimi ~170 m | punti 5-3-1 (maglia verde) |
| **Salita con GPM** | 90 % FTP | punti 5-3-1 (maglia a pois); la pendenza arriva al rullo |
| Inseguimento (10/20 min) | riprendere la scalatrice che scappa dalla cima | |
| **Volata finale** | 110 % FTP per 25 s e poi scatto | l'arrivo |

Mai più di 90 s sopra soglia senza recupero: gli sforzi sono 40 s (fuga) e 10 s (scatto), poi si recupera. Il commentatore (scritte brevi) dice cosa succede ("Lia attacca!", "Gruppo staccato: 7 s di vantaggio") e, se per 4 s non succede nulla, riporta i distacchi o il tempo che manca.

## Rivali tarati sulla FTP del giocatore
Il gruppo segue un copione di ritmo espresso come potenza equivalente in % della FTP del giocatore. Ogni rivale ha un profilo (passista, velocista, scalatore) = forza di base × fattore per momento (scalatori forti in salita e nelle fughe, velocisti nelle volate). La velocità nel gioco è una sola curva (potenza ÷ FTP, pendenza) per tutti, giocatore e rivali. Quindi **con 0,8 × FTP si resta nel gruppo, con 1,0 × si lotta per il podio, con 1,2 × si vince**, qualunque sia la FTP.
Regolazioni (in `TUNE`, `racer-sim.js`): forza dei rivali, coesione del gruppo, "il gruppo aspetta" in partenza e nei recuperi, "il gruppo insegue" chi scappa.

## Stelle (a fine tappa)
★ finire la tappa · ★★ almeno il 60 % degli obiettivi, oppure il podio · ★★★ tutti gli obiettivi, oppure il 70 % e il podio.

## Come si prova
- Senza browser: `node scripts/racer-sim-check.mjs --min=5` (4 livelli di potenza, piazzamento/stelle/eventi). `--min=10`, `--min=20`, `--level=0|2`.
- Nel gioco vero (bot Playwright, passi da 1/30 s): `node tests/serve.mjs &` poi `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/racer-bot.mjs` (`--powers=0` = un "coach" che fa quello che chiede la scheda).
- Strisce di fotogrammi: `scripts/racer-strip.mjs --at=<secondi di gara> [--pw=0]` (poi unire con uno script di montaggio).
- Prestazioni: `scripts/racer-perf.mjs`.
