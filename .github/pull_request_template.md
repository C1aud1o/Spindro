## What changes

<!-- A short description of the change and why it is needed. Link the issue: Closes #123 -->

## How it was tested

<!-- Which tests you ran, and on which device / trainer / browser, if relevant. -->

- [ ] `npm test` passes locally
- [ ] Tested on a real trainer (say which one), or the simulated trainer (`node tests/trainers/run.mjs`)
- [ ] Tested on the web app or the Android app (say which)

## Checklist

- [ ] Every commit is signed off with `git commit -s` (DCO, see CONTRIBUTING.md)
- [ ] Commit messages are in English and follow the rules in CONTRIBUTING.md
- [ ] The PR is focused: one feature or fix
- [ ] Screenshots or a short recording for UI changes, taken at phone width
- [ ] No secrets, keys, tokens or personal data in the code, the commits or the screenshots

## Games (fill in only if this PR adds or changes a game)

Guides: [CREATE-A-GAME](../docs/games/CREATE-A-GAME.md), [API](../docs/games/API.md), [DESIGN-RULES](../docs/games/DESIGN-RULES.md).

- [ ] One registry entry in `js/games/registry.js`; id, files, strings and storage keys follow the naming rule in `docs/games/API.md`
- [ ] `npm run game:check -- <id>` passes; paste the table below
- [ ] Playable with + / − and the pedals only (menu, run and results), no touch needed
- [ ] Works in workout mode (follows the workout, stars by the shared rule)
- [ ] No pressure: pushing harder is never punished, stopping pedalling pauses, no game over in the first minute
- [ ] Every visible text goes through `t('games.<id>...')` and exists in all five `locales/*.json` (`node tests/i18n-check.mjs` passes)
- [ ] The game never touches Bluetooth, the DOM outside its canvas, localStorage keys outside its id, or the network; `stop()` removes everything it added
- [ ] Every asset has a clear licence (CC0 / MIT / OFL or made for the project), is credited in `README.md` and `docs/legal/licenses.*.md`, and every shipped file is in `ASSETS` in `sw.js`
- [ ] My commits are signed off (`git commit -s`)
- [ ] The game does not recreate an existing commercial game
- [ ] A 12-frame strip at 390×780 was looked at (screenshots attached)
- [ ] Nothing is called "verified" on a real device unless it was tested on real hardware

<details><summary>game:check table</summary>

```
(paste the output of npm run game:check -- <id>)
```

</details>
