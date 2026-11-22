// REGISTRY OF GAMES: the single place that knows which games exist.
//
// The games list in the app, the opening of a game (`openGame`) and the direct URL `?game=<id>` are all driven by this
// file. To add a game: one new file or folder in js/games/, one entry below, its strings in locales/*.json. Nothing else.
// Step by step: docs/games/CREATE-A-GAME.md. The contract the class must follow: docs/games/API.md.
//
// NAMING RULE (one rule, no exceptions for new games). For a game with id `<id>` (lowercase letters and digits only):
//   code      js/games/<id>.js  or  js/games/<id>/index.js   (any further files next to it, same folder or `<id>-*.js`)
//   strings   games.<id>.name   title, also shown in the bar while playing
//             games.<id>.desc   pitch: what you do and what the workout is, 1-2 sentences (the card in the list)
//             games.<id>.help   controls, ONE short line (shown in the bar while playing)
//             games.<id>.*      anything else the game says, in the same five locales/*.json files
//   storage   localStorage keys start with `<id>` (e.g. `<id>Dur`, `<id>Best:5:normal`); personal bests: see progress.js
//   sw.js     nothing while `dev: true`; when the game ships, every file it imports goes into ASSETS (tests/games-registry.spec.mjs walks the imports and tells you which)
// Legacy games keep their historical file names (racer → racer3d.js, shooter → strike3d.js...); their ids never change,
// because scores, leaderboards and saved bests are keyed by them.
//
// Entry fields:
//   id      string          unique, see the rule above
//   icon    string          2-3 characters on the card ('01', 'L1', '▶'...)
//   load    () => Promise<class>   dynamic import of the class that implements the game interface (docs/games/API.md)
//   noAudio boolean         the game does not use the shared GameAudio: the constructor gets no third argument
//   dev     boolean         shown only with developer mode on (seven taps on the version number in Settings)
//   cls     string          extra CSS class for the card
//   order   number          position in the list (lower first); defaults to the order of this array

/** @typedef {import('./kit/types.js').GameEntry} GameEntry */

/** Fills in the derived fields (the i18n keys follow the naming rule above). */
export function defineGame({ id, icon, load, noAudio = false, dev = false, cls = '' }) {
  if (!/^[a-z][a-z0-9]*$/.test(id)) throw new Error(`game id "${id}": lowercase letters and digits only`);
  return { id, icon, load, noAudio, dev, cls, name: `games.${id}.name`, pitch: `games.${id}.desc`, controls: `games.${id}.help` };
}

/** @type {GameEntry[]} */
export const GAMES = [
  defineGame({ id: 'shooter', icon: '01', load: () => import('./strike3d.js').then((m) => m.Strike3D) }),
  defineGame({ id: 'horde', icon: '02', load: () => import('./horde.js').then((m) => m.Horde) }),
  defineGame({ id: 'gruppetto', icon: '03', load: () => import('./gruppetto.js').then((m) => m.Gruppetto) }),
  defineGame({ id: 'racer', icon: '04', load: () => import('./racer3d.js').then((m) => m.Racer3D) }),
  defineGame({ id: 'planata', icon: '05', load: () => import('./planata.js').then((m) => m.Planata) }),
  defineGame({ id: 'mattoni', icon: '06', load: () => import('./mattoni.js').then((m) => m.Mattoni) }),
  defineGame({ id: 'video', icon: '▶', cls: 'video-card', noAudio: true, load: () => import('../videoride.js').then((m) => m.VideoRide) }),
  // Living documentation: the template game (docs/games/CREATE-A-GAME.md). Visible only in developer mode.
  defineGame({ id: 'skeleton', icon: '3D', dev: true, load: () => import('./template/skeleton3d.js').then((m) => m.Skeleton3D) }),
  defineGame({ id: 'tempo', icon: 'T', dev: true, load: () => import('./template/tempo.js').then((m) => m.Tempo) }),
];

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
