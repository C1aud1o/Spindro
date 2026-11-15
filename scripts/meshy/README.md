# Modelli Meshy → asset del gioco

I modelli generati con Meshy arrivano come GLB con texture grandi e, a volte, centinaia di migliaia di triangoli.
Questi due script (Python 3 + numpy + Pillow, nessuno strumento esterno) li preparano per il telefono:

- `shrink.py in.glb out.glb`: texture ridotte a 1024 px in JPEG, geometria invariata.
- `decimate.py in.glb out.glb CELLE [LATO_TEXTURE] [CELLE_UV]`: semplifica raggruppando i vertici in una griglia di `CELLE`
  celle sull'altezza (60 ≈ 3.500 triangoli per un personaggio, 75 ≈ 22.000 per l'orco), tiene solo il colore base.

Nessuno dei due aggiunge lo scheletro: i personaggi in posa a T lo ricevono nel gioco (`js/games/kit/autorig.js`).
Per i personaggi: vestiti da ricolorare in verde pieno (#00ff00 circa), così il materiale li sostituisce col colore del corridore/tifoso.

`CELLE_UV` (default 24) è la finezza con cui si tengono separate le isole della texture: con 8–12 si scende a ~800–1.100 triangoli per un personaggio (`CELLE` 16), a costo di una texture meno precisa. Servono per la folla lontana (file `*-lo.glb`).
L'Orda usa: nemici vicini `36 1024 12` (~2.500–3.700 triangoli), folla lontana `16 256 8` (~800–1.100), orco `50 1024 16`, scenografia `12–26 512 8`.
## Cataloghi separati
`node scripts/meshy/generate.mjs --catalog=catalog-gruppetto.json [nome...]` usa un altro catalogo (stesso formato), così due sessioni in parallelo non si pestano i piedi su `catalog.json`.
Gruppetto (75 crediti, 15 a modello): trattore, staccionata, pecora, mucca, mulino. Il mulino resta con la sola `shrink.py`: `decimate.py` rompe le pale; anche la staccionata regge al massimo 10 celle.
## Icone della home (D7)
`node scripts/meshy/generate.mjs --catalog=catalog-icons.json` (6 modelli, 15 crediti l'uno) e poi `node scripts/meshy/render-icons.mjs`:
fotografa ogni `work/*.glb` con la stessa camera e la stessa luce (`icon-render.html`) in `assets/icons/<nome>.png` e `.webp`, 256 px trasparenti. I `.glb` restano fuori dal repository (`work/` è ignorata).
Pedal Strike (`catalog-strike.json`, 9 modelli, 135 crediti): robot soldato, robot bestione e mech (personaggi, `decimate.py 36 1024 12`, il mech `50 1024 16`), drone, carro ruspa, dirigibile, gabbia, gru del porto, grattacielo al neon (oggetti già sotto i 4.000 triangoli: solo `shrink.py`).
Attenzione: il saldo Meshy è condiviso fra le sessioni. Se un'altra sessione genera nello stesso momento, la differenza di saldo misurata da `generate.mjs` si gonfia (es. 20–25 invece di 15): il costo vero di un modello resta 15 (anteprima + rifinitura).
