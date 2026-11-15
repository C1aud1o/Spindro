// Conferma dentro l'app (al posto di confirm() del browser): si può usare anche con i soli tasti del Click.
// ask('testo') → Promise<boolean>. Il pulsante "Sì" è quello preselezionato dalla navigazione.
import { t } from './i18n.js';

export function ask(message, { ok, cancel, danger = false } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'calib dlg';
    const p = document.createElement('p'); p.className = 'dlg-msg'; p.textContent = message;
    const body = document.createElement('div'); body.className = 'calib-box'; body.setAttribute('role', 'dialog'); body.setAttribute('aria-modal', 'true');
    body.innerHTML = '<div class="row2"><button class="ghost" data-cancel></button><button class="cta" data-ok></button></div>';
    // azione che non si annulla: la selezione parte da "Annulla", così un tocco distratto del Click non cancella nulla
    body.querySelector(danger ? '[data-cancel]' : '[data-ok]').setAttribute('data-primary', '');
    if (danger) body.querySelector('[data-ok]').classList.add('danger-cta');
    body.prepend(p);
    body.querySelector('[data-cancel]').textContent = cancel || t('ui.cancel');
    body.querySelector('[data-ok]').textContent = ok || t('ui.ok');
    box.appendChild(body);
    document.body.appendChild(box);
    const done = (v) => { box.remove(); resolve(v); };
    body.querySelector('[data-ok]').addEventListener('click', () => done(true));
    body.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    box._cancel = () => done(false);
  });
}
