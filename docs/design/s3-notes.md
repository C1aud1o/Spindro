# S3 site launch: running checklist

Done
- Truth pass on site (en + it), README, Play store texts (en, it, fr, es, de): outdated games, "verified" claims, unmeasured numbers removed. Zwift Click is "partly verified" (only + / − of a Click v2); Garmin and other watches "should work".
- `scripts/site-shots.mjs`: re-runnable, 15 screens x 2 languages, 390x780 @2x, WebP < 120 KB, fake trainer connected. Old `site/shots.mjs` and `site/app-shots.mjs` removed.
- OG image from real screenshots (`node site/make-og.mjs`), 260 KB.
- `/developers/` and home "Build a game" section; links to `docs/games/*.md` appear automatically once they exist.
- Blog: 3 articles x 2 languages, RSS per language, Article JSON-LD, links from home.
- `tests/site.spec.mjs`: one h1, titles/descriptions, canonical, hreflang, links and anchors, image sizes/alt, sitemap, robots, feeds, word count, contrast.
- Contact sheet `docs/design/s3-site.png`.

Left / to redo at the end
- Re-run `node scripts/site-shots.mjs` once the app UI is final, then `node site/make-og.mjs`.
- Check `docs/games/CREATE-A-GAME.md` and `js/games/kit/workout-plan.js` after merging `origin/beta`; rebuild.
- Links to docs on GitHub point at `main`: they work after `beta` is promoted.
- axe-core runs through `tests/a11y.spec.mjs` (added on beta); the site passes.
- Merged beta (CSP, fonts, legal): conflicts resolved; screenshots regenerated against the merged build. Known: Horde Run captures look washed out under the software renderer; check on a real device and re-run the script.
