// "Finestra mini": una piccola finestra sempre in primo piano (Document Picture-in-Picture, solo Chrome/Edge desktop) con i numeri
// dell'allenamento, per guardare YouTube/Netflix in un'altra scheda mentre l'ERG continua. L'app e il suo ciclo restano nella scheda
// principale (il battito viene da un worker, js/ticker.js): qui si disegna soltanto.
import { buildMini } from './mini-view.js';

/** Document PiP disponibile? No nell'app Android (WebView), no in Firefox/Safari. */
export function miniSupported(win = window) {
  try {
    if (win.Capacitor?.isNativePlatform?.()) return false;
    return !!win.documentPictureInPicture && typeof win.documentPictureInPicture.requestWindow === 'function';
  } catch { return false; }
}

export function createMini({ t, getModel, actions, win = window }) {
  let pip = null; let view = null;
  const api = {
    get isOpen() { return !!pip; },
    update() { if (view) { try { view.paint(getModel()); } catch { /* finestra chiusa nel frattempo */ } } },
    /** Apre la finestra (serve un gesto dell'utente: clic o tasto nella scheda). Rifiuta con l'errore del browser. */
    async open() {
      if (pip) return pip;
      const w = await win.documentPictureInPicture.requestWindow({ width: 360, height: 420, disallowReturnToOpener: true });
      const doc = w.document;
      const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('css/mini.css', win.location.href).href;
      doc.head.append(link);
      doc.documentElement.lang = win.document.documentElement.lang;
      doc.title = t('mini.title');
      view = buildMini(doc, t, (act) => actions[act]?.());
      pip = w;
      w.addEventListener('pagehide', () => { if (pip === w) { pip = null; view = null; actions.closed?.(); } });
      // tastiera dentro la finestra: gli stessi tasti dell'app (spazio = pausa) e Esc chiude
      w.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } else if (e.key === ' ') { e.preventDefault(); actions.pause?.(); } });
      api.update();
      return w;
    },
    close() { const w = pip; pip = null; view = null; try { w?.close(); } catch { /* già chiusa */ } if (w) actions.closed?.(); },
  };
  return api;
}
