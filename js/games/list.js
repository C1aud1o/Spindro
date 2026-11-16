// Renders the games list (the cards in the games menu) from the registry: no per-game HTML in index.html.
import { GAMES } from './registry.js';

/** Fills `el` with one `.game-card` button per registered game. Texts use data-i18n, so a language change retranslates them. */
export function renderGameList(el, games = GAMES) {
  el.textContent = '';
  for (const g of games) {
    const b = document.createElement('button');
    b.className = `game-card${g.cls ? ` ${g.cls}` : ''}${g.dev ? ' dev-only' : ''}`;
    b.dataset.game = g.id;
    const icon = document.createElement('span'); icon.className = 'game-emoji'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = g.icon;
    const text = document.createElement('span');
    const name = document.createElement('b'); name.dataset.i18n = g.name;
    const pitch = document.createElement('small'); pitch.dataset.i18n = g.pitch;
    text.append(name, pitch); b.append(icon, text);
    el.append(b);
  }
  // A visible way out that sits in the focus order of the list (a controller with arrows can reach it; before, only B left the list).
  // Not a `.game-card`: the app opens a game for every `.game-card` click.
  const back = document.createElement('button'); back.className = 'small game-back'; back.dataset.i18n = 'games.exit'; back.type = 'button';
  back.style.cssText = 'grid-column:1/-1;justify-self:stretch;margin-top:6px';
  back.addEventListener('click', () => document.getElementById('closeGame')?.click());
  el.append(back);
  return el;
}
