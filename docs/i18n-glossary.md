# Translation glossary and guide

<!-- WORKING CHECKLIST (remove at the end)
Done: workflows, issue templates, docs in English, docs/README.md, glossary (this file).
Left: review of locales it/en/fr/es/de, site/i18n en+it, unused keys, tests/i18n-check.mjs, merge origin/beta, final tests.
-->

The app is translated in `locales/<lang>.json` (it, en, fr, es, de) and the site in `site/i18n/{en,it}.json`.
English is the reference for meaning; Italian was the original text. `node tests/i18n-check.mjs` checks missing keys,
placeholders, unused keys, leftover Italian words and untranslated strings.

## Adding a language
1. Copy `locales/en.json` to `locales/<code>.json` and translate the values (never the keys).
2. Add the language to the `LANGS` constant in `js/i18n.js` (it appears in the Settings language picker by itself).
3. Add it to the `speechLang()` map in `js/i18n.js` (BCP-47 tag of the voice coach, e.g. `fr: 'fr-FR'`).
4. Add `locales/<code>.json` to `ASSETS` in `sw.js` and bump `CACHE`.
5. `npm run test:i18n`.

## Technical rules
- `{name}` is a placeholder: keep it exactly as it is (same name, same count in every language).
- Plurals: `key.one` / `key.other` (and `few`, `many`, `two`, `zero` if the language needs them), picked with `Intl.PluralRules`. The parameter is `{count}`.
- Ordinals (`ordinal.one|two|few|other`): `{n}°` in Italian, `{n}st/nd/rd/th` in English, `{n}ᵉ`/`{n}er` in French, `{n}.º` in Spanish, `{n}.` in German.
- Keys ending in `.html` or used with `data-i18n-html` contain markup (`<b>`, `<a>`, `<code id=…>`): do not remove tags or `id`s.
- The voice coach phrases (`coach.*`) are spoken: write them for the ear, without symbols.
- Kept in English everywhere, never translated: developer mode (class `dev-only`, debug panel, log), the title and body of GitHub reports, product and protocol names (Strava, Garmin Connect, Zwift Click, FTMS, ERG…), **game names** (Breakaway, Horde Run, Pedal Strike, Slipstream, Updraft, Feed Zone, Tempo).
- Strings must fit their buttons: shorten the wording, do not shrink the font. Check German and French at 360×640.
- Tone: friendly, short sentences, no jargon on ordinary screens.

## Style per language
| | Address | Capitalization | Numbers and units | Punctuation |
|---|---|---|---|---|
| **it** | informal singular (*tu*) | sentence case, no English Title Case; days and months lower case | decimal comma, `1.234`; km, km/h, kJ, W, rpm, bpm | no space before `: ; ! ?` |
| **en** | — | sentence case for buttons and labels; ALL CAPS only for game banners | decimal point, `1,234` | straight apostrophes are fine |
| **fr** | informal singular (*tu*, never *vous*) | sentence case, no Title Case; days and months lower case | decimal comma, narrow space for thousands; `tr/min` (not rpm) | non-breaking space (U+00A0) before `: ; ! ?` and inside « » |
| **es** | informal singular (*tú*) | sentence case, no Title Case; days and months lower case | decimal comma, `1.234`; rpm | opening `¿` `¡` always present |
| **de** | informal singular (*du*, lower case) | nouns capitalized as usual, nothing else; no English Title Case | decimal comma, `1.234`; `U/min` | no space before `: ; ! ?` |

## Fixed terms
One row per concept. When a string uses the concept, use the word in this table.

| Concept | Italian | English | French | Spanish | German |
|---|---|---|---|---|---|
| trainer (smart trainer) | rullo | trainer | home-trainer | rodillo | Rollentrainer |
| virtual gears / shifting | cambio virtuale | virtual gears | vitesses virtuelles | marchas virtuales | virtuelle Gänge |
| gear (one of them) | marcia | gear | vitesse | marcha | Gang |
| shift up / down | cambia marcia | shift | changer de vitesse | cambiar de marcha | schalten |
| ERG | ERG | ERG | ERG | ERG | ERG |
| FTP | FTP | FTP | FTP | FTP | FTP |
| cadence | cadenza | cadence | cadence | cadencia | Trittfrequenz |
| cadence unit | rpm | rpm | tr/min | rpm | U/min |
| power / watts | potenza / watt | power / watts | puissance / watts | potencia / vatios (W) | Leistung / Watt |
| power meter | misuratore di potenza | power meter | capteur de puissance | potenciómetro | Leistungsmesser |
| heart rate | battito (cardio) | heart rate | fréquence cardiaque | frecuencia cardiaca | Herzfrequenz |
| heart-rate strap | fascia cardio | heart-rate strap | ceinture cardio | banda cardíaca | Brustgurt |
| warm-up | riscaldamento | warm-up | échauffement | calentamiento | Aufwärmen |
| effort | sforzo | effort | effort | esfuerzo | Belastung |
| recovery | recupero | recovery | récupération | recuperación | Erholung |
| cool-down | defaticamento | cool-down | retour au calme | vuelta a la calma | Ausfahren |
| interval | ripetuta | interval | intervalle | intervalo | Intervall |
| threshold | soglia | threshold | seuil | umbral | Schwelle |
| endurance | fondo | endurance | endurance | resistencia | Grundlagenausdauer |
| sweet spot | sweet spot | sweet spot | sweet spot | sweet spot | Sweet Spot |
| ramp (test) | rampa (test a rampa) | ramp (ramp test) | rampe (test en rampe) | rampa (prueba de rampa) | Rampe (Rampentest) |
| workout | allenamento | workout | entraînement | entrenamiento | Training |
| workout step | tratto | step | palier | tramo | Abschnitt |
| training plan | piano di allenamento (piano) | training plan (plan) | plan d'entraînement (plan) | plan de entrenamiento (plan) | Trainingsplan (Plan) |
| ride (a recorded session) | uscita | ride | sortie | salida | Fahrt |
| ride history | storico | history | historique | historial | Verlauf |
| controller (Zwift Click/Play/Ride) | controller | controller | manette | mando | Controller |
| device | dispositivo | device | appareil | dispositivo | Gerät |
| route (GPX) | percorso | route | parcours | ruta | Strecke |
| gradient / grade | pendenza | gradient | pente | pendiente | Steigung |
| voice coach | coach vocale | voice coach | coach vocal | coach de voz | Sprach-Coach |
| watch (Garmin) | orologio | watch | montre | reloj | Uhr |
| leaderboard | classifica | leaderboard | classement | clasificación | Rangliste |
| challenge (monthly) | sfida | challenge | défi | desafío | Challenge |
| weekly goal | obiettivo settimanale | weekly goal | objectif hebdomadaire | objetivo semanal | Wochenziel |
| stage (race) | tappa | stage | étape | etapa | Etappe |
| bunch / peloton | gruppo | bunch | peloton | pelotón | Feld |
| breakaway | fuga | breakaway | échappée | escapada | Ausreißergruppe |
| slipstream / draft | scia | slipstream | aspiration (« dans la roue ») | rebufo | Windschatten |
| intermediate sprint | traguardo volante | intermediate sprint | sprint intermédiaire | meta volante | Zwischensprint |
| KOM climb | GPM | KOM | col (GPM) | puerto (GPM) | Bergwertung |
| green / polka-dot jersey | maglia verde / a pois | green / polka-dot jersey | maillot vert / à pois | maillot verde / de lunares | Grünes / Gepunktetes Trikot |
| sprint | sprint / scatto | sprint | sprint | sprint | Sprint |
| stars (★ rating) | stelle | stars | étoiles | estrellas | Sterne |
| settings | impostazioni | settings | réglages | ajustes | Einstellungen |
| account / sign in | account / accedi | account / sign in | compte / se connecter | cuenta / iniciar sesión | Konto / anmelden |

Notes:
- Italian "scatto" is the short hard effort (attack/sprint in a workout); "sprint" is the race finish. Use the same split in the other languages where it exists (fr *démarrage* vs *sprint*, de *Antritt* vs *Sprint*).
- Zwift Click / Play / Ride are product names; the word "controller" for the device class follows the table.
- Game ids (`planata`, `gruppetto`, `mattoni`, `horde`, `racer`, `shooter`) never change; the display names are Updraft, Slipstream, Feed Zone, Horde Run, Breakaway, Pedal Strike in every language.
