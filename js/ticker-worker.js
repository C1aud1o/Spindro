// Metronomo per il ciclo a 1 Hz dell'app (js/ticker.js). Un timer dentro un worker non viene rallentato quando la scheda
// passa in secondo piano (i setInterval della pagina sì: ~1 volta al secondo, dopo 5 minuti nascosta anche solo 1 volta al minuto).
let id = null;
self.onmessage = (e) => {
  if (id) clearInterval(id);
  id = null;
  if (e.data && e.data.start) id = setInterval(() => self.postMessage(1), e.data.ms || 1000);
};
