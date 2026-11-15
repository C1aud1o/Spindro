# Stile dei giochi 3D di Spindro

Un solo stile per tutti i giochi. Si ottiene con modelli **low-poly CC0** (Quaternius, Kenney) e con il codice
condiviso in `js/games/kit/`. Il gioco di riferimento è **Turbo Pedali** (`js/games/racer3d.js`):
le foto sono in `docs/giochi-shots/`.

## 1. Idea
Giocattolo luminoso, pomeriggio d'estate, corsa vera. Forme semplici, colori pieni, luce calda.
Mai realistico, mai cupo. Niente loghi, nomi o personaggi di altri giochi.

## 2. Palette (`PALETTE` in `kit/style.js`)
| Uso | Colori |
|---|---|
| Marchio, giocatore, numeri importanti | lime `#d9ff3d`, inchiostro `#15141b` |
| Accenti HUD | ciano `#4de3ff` (scia, sprint), oro `#ffd34d` (avvisi), rosso `#ff5a6a` (salita dura, arrivo) |
| Avversari (maglie) | 10 colori saturi, uno per corridore, mai il lime |
| Mondo | erba `#86b84f`/`#5f9440`, asfalto `#5a5960`, terra `#c08a5b`, roccia `#a99a8c` |

Regola: il lime appartiene al giocatore. Nel mondo i colori sono più spenti dei personaggi.

## 3. Luce, cielo, nebbia
- Tre **ore del giorno** (`TIMES`): `morning`, `golden`, `dusk`. Una per livello.
- **Cielo a gradiente** con alone del sole (`skyDome`): alto, orizzonte, basso.
- **Luce**: emisfera (cielo/terra) + un sole con ombre che segue il giocatore (`styleLights`).
- **Nebbia** lineare del colore dell'orizzonte (`styleFog`, 80–520 m): nasconde il fondo e fa profondità.

## 4. Materiali
- **Toon** con rampa a 3 toni (`toonMaterial`): il sole fa ombre nette, l'emisfera dà il gradiente leggero.
- Colori per vertice invece di texture quando possibile: una geometria, un materiale, un draw call.
- Texture solo piccole (palette 32×32, scritte disegnate al volo).

## 5. Camera
- FOV 60° (in volata fino a ~75°: la velocità si sente).
- Inseguimento morbido 5–6 m dietro, 2 m sopra, sguardo 20 m avanti: si vede l'orizzonte.
- **Stacchi netti** per i momenti speciali (arrivo, podio), non carrellate lente.
- **Scossa** a trauma (`Shake`): urto 0,55, oggetto 0,35, via 0,3. Mai durante la lettura dei numeri.

## 6. HUD (in bici, telefono a 1 m)
- Numeri chiave **≥ 44 px** (watt e posizione 58 px), etichette ≥ 13 px, font condensato pesante, contorno scuro.
- Angoli fissi: posizione in alto a sinistra, **watt** in alto a destra (colore = zona), distanza al centro,
  pendenza in un riquadro colorato, marcia sotto la posizione, profilo in basso.
- Pannelli semitrasparenti, mai a tutto schermo durante la corsa.
- Nomi sopra gli avversari vicini: al massimo 4, senza sovrapposizioni.

## 6b. Caratteri e testo che non si sovrappone (kit/hud.js)
**Caratteri** (OFL, self-hosted in `assets/fonts`, `@font-face` in `css/style.css`, licenze in `docs/legal`):
- **Lilita One** (`FONT_DISPLAY`): titoli e numeri. Esiste solo in 400: non chiedere il grassetto.
- **Nunito** 700/900 (`FONT_TEXT`): istruzioni, regole, frasi lunghe. Si sceglie con `font: 'text'`.
- Niente monospace nei giochi. `hudText` di `engine.js` è ora lo stesso `txt` del kit, quindi anche i giochi che lo usano ereditano font e riduzione.

**Regole d'uso** (vale per tutti i giochi):
1. Ogni frame di HUD inizia con `hudView(ctx, W, H)`: dichiara la zona sicura (margine 10 px). Da lì `txt()` si riduce da solo
   (fino al 60%, poi mette "…") per stare nello spazio fra `x` e il bordo; con `maxW` si impone un limite più stretto (es. dentro un riquadro).
2. Paragrafi: `paragraph(ctx, testo, x, y, { size, maxW, maxH, maxLines })` va a capo alle parole, spezza le parole troppo lunghe e,
   se serve, riduce il corpo per stare in `maxH`. Restituisce `{ bottom }` per mettere il blocco dopo. `wrapLines()` per misurare prima.
3. Messaggi a centro schermo: **mai** una lista propria. `const q = new MessageQueue()`; `q.say(testo, { color, prio, dur, big, sub })`;
   `q.update(dt)` a ogni passo e `q.draw(ctx, W, H, { u, y })` nell'HUD. Un messaggio alla volta; `prio` 0 chiacchiere, 1 normale, 2 grande,
   3 arrivo/avvisi importanti; chi ha priorità ≥ +2 interrompe quello in corso; un messaggio che aspetta più di 3 s (`maxWait`) sparisce;
   lo stesso `key` non si accoda due volte. `Base3D.say(testo, colore, durata, big, prio)` e il `say` di Turbo Pedali e L'Orda lo usano già.
4. Nomi e etichette agganciati a oggetti 3D: calcola la posizione e blocca la x dentro lo schermo (`clamp`), come `drawTags` in Turbo Pedali.
5. Verifica: `node scripts/design-shots-games.mjs [racer|horde|gruppetto]` e `node scripts/design-shots-d8.mjs [planata|mattoni|shooter] [--lang=it,de]` fotografa menu e partita a 390×780 e 1280×720 in `docs/design/`.

## 7. Juice: ogni evento si vede e si sente
| Evento | Effetto |
|---|---|
| Moneta | scintilla, testo "+1", suono |
| Oggetto preso / usato | esplosione di particelle, hit-stop 0,05 s, scossa, FOV più largo |
| Scia | cuneo chiaro sull'asfalto dietro chi ti precede, linee di vento, "whoosh" |
| Sorpasso | suono, testo; negli ultimi 400 m un attimo di rallentatore |
| Ultimi 500 m | striscione, campanella |
| Arrivo | rallentatore 0,22× per ~2 s, coriandoli, stacco di camera |
| Podio | ciclisti in piedi, braccia alzate, coriandoli, tifo |
| + / − | marcia evidenziata nell'HUD, click del cambio |

Le particelle usano le texture Kenney di `assets/fx`. I suoni sono sintetizzati in `js/games/audio.js`.

## 8. Prestazioni
- Obiettivo **60 fps** su Android medio, **minimo 30**.
- **Draw call < 150**: istanze per tutto ciò che si ripete (`kit/env.js`), personaggio in una mesh sola.
- Triangoli in vista < 250k (alta), < 120k (bassa).
- Modelli **.glb ottimizzati** (gltf-transform: weld, semplificazione, quantizzazione, meshopt). Texture piccole.
- **Qualità automatica** (`kit/quality.js`): si misura il frame rate nei primi secondi e si scende di livello.

| Livello | Pixel ratio | Ombre | Bagliore | Densità oggetti | Pubblico |
|---|---|---|---|---|---|
| Alta | 1,5 | 1024 | sì | 100% | 100% |
| Media | 1,0 | 512 | no | 70% | 60% |
| Bassa | 0,75 | no | no | 40% | 30% |

Si può fissare in *Giochi → Qualità grafica*.

## 9. Asset
- Solo CC0 / MIT / OFL, con `License.txt` nella cartella e crediti in README e `docs/legal/licenses.*.md`.
- Personaggi: `assets/3d/quaternius/cyclist.glb` (scheletro vero) e `fan.glb` (versione leggera per il pubblico).
  Le pose si calcolano sulle ossa (IK delle gambe sui pedali), le maglie si colorano per vertice.
- Peso dei nuovi asset dei giochi: tenere ogni aggiunta sotto i 6 MB.

## 10. Misure di Turbo Pedali (2026-11-08)
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/game-shots.mjs --fps`: tappa 2, in salita fra il pubblico, CPU rallentata 4x.
Nel cloud non c'è GPU (SwiftShader disegna nella CPU), quindi gli fps del browser di prova (0,4–3) non dicono nulla del telefono.
Si misura il costo CPU per fotogramma (logica, pose delle ossa, preparazione del disegno, HUD) e il carico per la GPU.

| Schermo | Qualità | CPU ms/fotogramma (4x) | fps massimi dalla CPU | Draw call | Triangoli |
|---|---|---|---|---|---|
| 390×844 | alta | 22,9 | ~44 | 117 | 318k |
| 390×844 | media | 19,6 | ~51 | 102 | 240k |
| 390×844 | bassa | 11,8 | 60 | 66 | 139k |
| 1280×720 | media | 23,2 | ~43 | 102 | 240k |
| 1280×720 | bassa | 17,9 | ~56 | 70 | 141k |

Draw call sempre sotto 150. Il frame rate vero va verificato su un Android medio: la qualità automatica scende da sola
se nei primi secondi si va sotto 48 fps.

## 11. L'Orda di notte (2026-11-15)
Eccezione dichiarata alla regola «mai cupo»: L'Orda è ambientata in un cimitero di notte, ma resta leggibile (luna, nebbia leggera, lampioni, asfalto con bordi chiari).
- **Nemici** (Meshy, scheletro automatico): vicini con le ossa e animazione procedurale (`kit/walkers.js`: camminata/corsa barcollante, braccia avanti, colpo, caduta all'indietro); lontani istanze in posa cotta da ~1.000 triangoli (`*-lo.glb`), con le gambe che oscillano nel vertex shader. Tetto di nemici con le ossa: alta 26, media 16, bassa 9.
- **Giocatore e alleati**: ciclista Meshy con la bici (gli alleati col modello leggero `fan-lo.glb`), blaster Meshy sul manubrio che cambia colore e misura a ogni arma.
- **Mondo** (`horde-world.js`): strada infinita, scenografia istanziata e deterministica (lapidi, cancellata, cripta, alberi secchi, lampioni), 3 luci puntiformi sui lampioni più vicini (1 in qualità bassa), portali con arco di pietra Meshy (energia blu o rossa).
- **HUD**: una riga in alto (punteggio, ondata, cuori), in basso la potenza con numero da 56–64 px, l'arma e la barra dell'evoluzione. Niente cerchi o anelli sotto i personaggi.
- Misure e foto: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-shots.mjs [--fps]` (foto in `docs/giochi-shots/horde-*.png`).

Misure de L'Orda (2026-11-15), 90 nemici in scena, CPU 4x, 390×780 (come sopra: gli fps del browser di prova non dicono nulla del telefono):

| Qualità | Prima: CPU ms · draw call · triangoli | Dopo: CPU ms · draw call · triangoli |
|---|---|---|
| alta | 30,2 · 798 · 213k | 23,7 · 108 · 367k |
| media | 34,2 · 787 · 214k | 15,4 · 57 · 249k |
| bassa | 24,8 · 464 · 161k | 12,3 · 43 · 182k |

## 12. Planata (2026-11-15)
Stesso stile degli altri tre giochi; gameplay invariato (watt = quota, porte, creste, ponti).
- **Aereo**: modello Meshy (`assets/3d/meshy/plane.glb`, 3.200 triangoli) con elica che gira alla cadenza (pale + disco sfocato a cadenza alta), muso su e giù con la quota, ombra sul terreno.
- **Mondo** (`planata.js`): terreno a pezzi riciclati con colori per vertice (campi a toppe e strisce, bosco, roccia, riva sabbiosa), valle piatta al centro e colline ai lati, laghi ogni ~300 m (piano d'acqua toon). La forma dipende solo dalla posizione, quindi è sempre uguale.
- **Istanze** (una per modello, riscritte a ogni pezzo nuovo): alberi e cespugli Quaternius, cipressi, case/chiesa/capanne/mulino Meshy a villaggi, nuvole Meshy (`cloud.glb`) alte e basse, isole col faro (`island.glb`) in aria. Densità e distanza delle sagome seguono la qualità (`kit/quality.js`).
- **Porte**: anello a spicchi bianchi e arancio, pellicola luminosa e raggio che scende a terra (si legge l'altezza). A segno: verde e si allarga; mancata: grigio e rossa. Creste e ponti: roccia a poligoni con erba sopra.
- **Velocità**: linee di vento intorno all'aereo (più forti spingendo oltre la tua media o in sprint), campo visivo che si allarga, scossa all'urto.
- **HUD**: tre riquadri (punti, metri, watt ≥ 44 px), cuori, combo, altimetro con la banda dei watt da fare e riga «anello/cresta/ponte tra N m». Foto e misure: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/planata-shots.mjs [--fps]`.

Misure di Planata (2026-11-15), demo in volo, CPU 4x, stesso script prima/dopo (gli fps del browser di prova non dicono nulla del telefono):

| Schermo · qualità | Prima: CPU ms · draw call · triangoli | Dopo: CPU ms · draw call · triangoli |
|---|---|---|
| 390×780 alta | 7,5 · 144 · 23k | 8,6 · 74 · 196k |
| 390×780 media | 5,0 · 127 · 21k | 8,9 · 60 · 138k |
| 390×780 bassa | 4,1 · 99 · 21k | 6,7 · 62 · 93k |
| 1280×720 alta | 7,4 · 146 · 23k | 10,8 · 76 · 198k |
| 1280×720 media | 5,8 · 130 · 23k | 11,7 · 62 · 137k |
| 1280×720 bassa | 4,4 · 98 · 19k | 8,0 · 59 · 96k |

Tutto resta sotto i 16,6 ms (60 fps dalla CPU a 4x); i draw call si dimezzano. I triangoli salgono perché ora c'è un mondo vero.
## 12. Mattoni (2026-11-15)
Gameplay invariato (rimbalzi, cadenza = velocità della palla, + / − muovono la racchetta), grafica e tema ciclismo:
- **Arena**: strada di tappa in prospettiva (asfalto, cordoli rosso-bianchi, traguardo a scacchi), transenne Meshy sui lati, pubblico Meshy che salta, cipressi, tende del ristoro, balle di fieno, arco del traguardo, colline e montagne nella nebbia. Ora del giorno diversa a ogni livello (`golden`, `morning`, `dusk`).
- **Sfondo animato**: bandierine al vento, nuvole che scorrono, pubblico che salta, ruote che girano.
- **Racchetta**: ciclista Meshy con bici dietro un assale con due ruote (si allarga col power-up).
- **Blocchi**: borracce Meshy (tinte ruotate per riga), cartelli di tappa (2 colpi), balle di fieno (3 colpi), transenne indistruttibili. Livelli a forma di salita, ruota, maglia, cuore e muro di fieno.
- **Power-up**: gel (racchetta larga, palle ×3, palla lenta) e maglia (vita), procedurali. Il gel Meshy è scartato: la texture ha un logo.
- **Juice**: esplosioni Kenney, coriandoli, scossa, hit-stop 0,03 s sui blocchi, rallentatore 0,25× a fine livello, palla infuocata in sprint.
- **HUD**: tre riquadri (livello e vite, punti, watt), barra potenza, riga con velocità palla, combo e potenziamenti attivi.
- Modelli: `bottle.glb` (1.037 triangoli) e `stage_sign.glb` (456) da `decimate.py`; crediti Meshy spesi in questa sessione: 0 (modelli già generati, catalogo `scripts/meshy/catalog-mattoni.json`).
- Foto e misure: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/mattoni-shots.mjs [--fps] [--levels]` (foto in `docs/giochi-shots/mattoni-*.png`, 390×780 e 1280×720).

Misure di Mattoni (CPU 4x, 390×780; prima → dopo): alta 6,5 → 10,1 ms · 128 → 140 draw call · 4k → 284k triangoli; media 7,6 → 9,5 ms · 114 → 121 · 4k → 200k; bassa 3,9 → 8,5 ms · 60 → 78 · 2k → 103k. A 1280×720 dopo: 9,2 / 11,9 / 6,4 ms. Sempre sotto i 16 ms di CPU (60 fps); i triangoli di media e bassa superano gli obiettivi, da riprovare su un telefono vero. Il vecchio Mattoni, al primo power-up, andava in errore (`power()` copriva la potenza letta dal rullo): corretto.
### Feed Zone: gameplay rifatto (le righe sopra descrivono la versione precedente)
`js/games/mattoni.js` (id `mattoni`, nome **Feed Zone** in tutte le lingue); il piano dell'allenamento è quello di Horde Run (`horde-plan.js`).
- **Idea**: sei il ciclista e la bici fa da racchetta; la borraccia rimbalza sui soigneur che scorrono in tre file e consegna le musette. Obiettivo sempre visibile: «FEED ZONE 3/4» e «MUSETTE 12/22».
- **Cadenza = velocità della borraccia** (8,6 m/s a 85 giri, da 0,8 a 1,35 volte). **Watt in zona (≥ 92 % della richiesta)** = turbo che si carica (×1…×4 sui punti); con il turbo a metà il colpo successivo è un «SMASH» (borraccia infuocata). Nei **rush** (sforzo e scatto) tenendo il bersaglio la borraccia è infuocata di continuo: trapassa le file e ogni consegna vale doppio.
- **Soigneur**: musette normali (1 colpo), casse (2 colpi), soigneur col gel (cade un gel: turbo +50 % e una vita). Le file sono catene rigide che vanno avanti e indietro; chi è consegnato torna dopo 4–6 s crescendo da zero (niente comparse di colpo).
- **Zone**: ogni ondata cambia formazione (file di musette, stazione gel, vento laterale, auto di squadra); la 4ª e l'ultima chiudono con l'**auto della squadra** (mini-boss con barra vita, modello Meshy `team_car.glb`) che si batte con i colpi infuocati. Se il blocco finisce prima se ne va.
- **Perdere la borraccia** costa il combo, il 50 % del turbo e una vita; a zero vite (mai nel primo minuto) c'è una «foratura» e si riparte con 3 vite. Mai game over. Chi smette di pedalare va in pausa.
- **Stelle** come Horde Run: 1 = finita; 2 = metà degli sforzi; 3 = 80 % degli sforzi, tutte le auto, al massimo 3 forature. Record e stelle in `localStorage` (`feedBest:<durata>:<livello>`).
- **Prove**: `tests/feedzone.spec.mjs` (bot deterministico a 0,6/0,8/1,0/1,2 × FTP, bot distratto, pausa, misure dello schermo, comandi). Il caso del gioco viene da `game.seed`.

## 12. Pedal Strike (2026-11-15, gameplay rifatto il 2026-11-15 sera)
Sparatutto in corsa in 3D (`js/games/strike3d.js`, mondo in `js/games/strike-world.js`, forma dell'allenamento in `js/games/strike-plan.js`).
La grafica (porto, passo, Motor City, gru, boss) è quella di prima; sono cambiati inquadratura, ritmo, nemici e difficoltà.
- **La partita è un allenamento** (regole di `docs/giochi-design.md`): 5, 10 o 20 minuti scelti nel menu, livello Facile/Normale/Difficile (−10 % / 0 / +10 %).
  Avvio facile 45–60 s al 60 % FTP, ondate di sforzo (95–110 %) e recupero (58 %), scatti di 10 s al 135 % (sempre seguiti da 40 s facili),
  **mini-boss a metà** e **boss finale** al 105 %, 30 s di defaticamento con il riepilogo. Difficoltà che si adatta: 2 sforzi falliti di fila −5 %, 3 riusciti +5 % (±15 %).
  Uno sforzo è riuscito se la media del blocco è almeno il 95 % della richiesta. In alto: tempo che manca, profilo dell'allenamento con il segno «sei qui» e gli esiti (✓), scheda del blocco con i watt richiesti e la barra della potenza.
- **Camera alle spalle, di tre quarti** (non più di lato): il ciclista occupa circa il 30 % dell'altezza a 390×780, la strada e i nemici davanti. La nebbia è più vicina e il paesaggio viene preparato 170 m avanti: gli oggetti nuovi nascono dentro la foschia.
- **Comandi**: + corsia a destra, − corsia a sinistra (una sola funzione in partita). Nel menu − passa alla riga dopo, + cambia la riga (Parti, Durata, Livello, Mondo, Eroe).
  Si spara da soli; i watt in % della FTP decidono la cadenza; **in zona** durante uno sforzo i colpi sono pieni (×1,5, scia verde).
- **Nemici diversi**: soldato a piedi (spara un colpo annunciato), cecchino sul disco volante (tiene la distanza e spara da lontano: si schiva cambiando corsia), bestione (la corsia diventa rossa, poi carica), **robot con lo scudo** (cede solo sopra i watt scritti sopra la sua testa), drone (bombe sul cerchio rosso), sciami di piccoli robot, transenne. Ogni attacco si vede almeno 0,6 s prima.
- **Boss con fasi legate allo sforzo**: scudo a esagoni che cede solo tenendo i watt richiesti per 10 s (mini-boss) o 15–20 s (boss), poi si spara; sotto metà vita «SCATTO: colpo finale» (l'overdrive si carica più in fretta). Vita tarata sulla FTP: a quella potenza cade in ~9 s (mini) / ~16 s (boss) di fuoco. Se il blocco finisce prima, si ritira (niente stella, nessuna punizione).
- **Serie di colpi** con traguardi (×5, ×10, ×20…: punti e overdrive), **potenziamenti a tempo** che cadono dai robot (mitraglia, ventaglio, razzi, laser 10–12 s; scudo 8 s; punti ×2 10 s; cuore), gabbie da liberare (compagno che spara per 30 s).
- **OVERDRIVE** (scatto sopra il 135 %): rallentatore 0,22× per un istante, lampo bianco, onda d'urto, campo visivo che si allarga, tutti i robot vicini saltano in aria a catena, poi 7 s di colpi su tre corsie, invulnerabile.
- **Fine partita**: 1–3 stelle (★ finita · ★★ almeno il 60 % degli sforzi · ★★★ almeno l'85 % e boss abbattuto), record per durata, eroi sbloccati con le stelle (Vale a 3, Nonno Gino a 6). Niente game over: finiti i cuori ci si rialza dopo 2 s. Chi smette di pedalare va in pausa.
- **Demo senza rullo**: 0,8 × FTP, segue gli sforzi e fa gli scatti, pilota automatico.
- Strumenti: `scripts/strike-bot.mjs` (bot a 4 livelli di potenza), `scripts/strike-film.mjs` (fotogrammi a 10 al secondo e strisce `docs/giochi-shots/strike-striscia-*.png`), `scripts/strike-shots.mjs [--fps] [--level=0|1|2]` (foto e misure).

Misure di Pedal Strike dopo il nuovo gameplay (Motor City, sforzo con 11–13 nemici, scudi e gabbia; CPU 4x; come sopra gli fps del browser di prova non contano):

| Schermo | Qualità | CPU ms/fotogramma (4x) | Draw call | Triangoli |
|---|---|---|---|---|
| 390×780 | alta | 20,6 | 89 | 177k |
| 390×780 | media | 17,5 | 77 | 165k |
| 390×780 | bassa | 20,6 (16,1 in un'altra prova) | 93 | 114k |
| 1280×720 | media | 20,2 | 73 | 175k |
| 1280×720 | bassa | 20,9 | 58 | 123k |

Bot (`scripts/strike-bot.mjs`, 5 min, Normale, FTP 200): 0,6 × → ★, 0,8 × → ★, 1,0 × → ★★★, 1,2 × → ★★★; primo evento a 2,4 s, mai più di 4 s senza eventi, 92–119 eventi al minuto.
