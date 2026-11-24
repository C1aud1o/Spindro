// Ciclo a 1 Hz che continua a battere con la scheda nascosta (finestra mini, YouTube/Netflix in un'altra scheda).
// Chrome rallenta i setInterval delle schede in secondo piano (1/s, poi 1/min): il comando ERG ripetuto ogni ~2 s e l'orologio
// dell'allenamento non possono dipendere da quelli. Il battito viene da un worker (non rallentato); il setInterval resta come
// riserva (e perché i test con orologio finto lo guidano). Chi arriva per secondo salta se l'altro è appena passato.
// In più si tiene un Web Lock: le pagine che ne hanno uno sono escluse dal rallentamento "intenso" di Chrome.
const MIN_GAP = 800; // ms: due giri più vicini di così sono lo stesso battito arrivato da due strade

export function startTicker(fn, ms = 1000) {
  let last = -Infinity;
  const run = () => { const n = performance.now(); if (n - last < MIN_GAP) return; last = n; fn(); };
  const timer = setInterval(run, ms);
  let worker = null;
  try {
    worker = new Worker(new URL('./ticker-worker.js', import.meta.url));
    worker.onmessage = run;
    worker.onerror = () => { try { worker.terminate(); } catch { /* già chiuso */ } worker = null; };
    worker.postMessage({ start: true, ms });
  } catch { worker = null; /* niente worker: resta il solo setInterval */ }
  try { navigator.locks?.request('spindro-ticker', () => new Promise(() => {})).catch(() => {}); } catch { /* niente Web Locks */ }
  return { stop() { clearInterval(timer); worker?.terminate(); }, get viaWorker() { return !!worker; } };
}
