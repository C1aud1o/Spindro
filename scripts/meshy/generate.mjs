// Genera i modelli del catalogo con Meshy (text-to-3d: preview + refine). Uso: node scripts/meshy/generate.mjs [--catalog=file.json] [nome...]
// Da Node serve: NODE_USE_ENV_PROXY=1 (proxy di rete) e NODE_EXTRA_CA_CERTS=<bundle CA del proxy> nel cloud.
// Riprende da dove si era fermato: lo stato sta in catalog.json (campi task_preview, task_refine, credits, status).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --catalog=FILE usa un altro catalogo (es. catalog-gruppetto.json) per non toccare quello condiviso
const catArg = argv.find(a => a.startsWith('--catalog='));
const CAT = path.join(dir, catArg ? catArg.slice(10) : 'catalog.json');
const WORK = path.join(dir, 'work');
const BASE = 'https://api.meshy.ai/openapi';
const H = { Authorization: 'Bearer ' + (process.env.MESHY_API_KEY || 'proxy-injected'), 'Content-Type': 'application/json' };
const BUDGET = Number(process.env.MESHY_BUDGET || 450);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = c => fs.writeFileSync(CAT, JSON.stringify(c, null, 1));
async function api(method, url, body) {
  const r = await fetch(BASE + url, { method, headers: H, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const balance = async () => (await api('GET', '/v1/balance')).balance;
async function wait(id) {
  for (;;) {
    const t = await api('GET', '/v2/text-to-3d/' + id);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error('task ' + id + ' ' + t.status + ' ' + JSON.stringify(t.task_error));
    await sleep(10000);
  }
}
async function spend(fn) { const b = await balance(); const r = await fn(); return [r, b - await balance()]; }

const args = argv.filter(a => !a.startsWith('--'));
const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
fs.mkdirSync(WORK, { recursive: true });
const start = await balance();
let used = cat.reduce((s, e) => s + (e.credits || 0), 0);
console.log('saldo iniziale', start, 'già spesi', used);
for (const e of cat) {
  if (args.length && !args.includes(e.name)) continue;
  if (e.status === 'done') continue;
  if (used + 15 > BUDGET) { console.log('budget insufficiente, stop'); break; }
  const char = e.kind === 'character';
  try {
    if (!e.task_preview) {
      const body = { mode: 'preview', prompt: e.prompt, model_type: 'smart-topology', ai_model: 'meshy-t2.5',
        target_polycount: char ? 10000 : 4000 };
      if (char) body.pose_mode = 't-pose';
      const [r, c] = await spend(() => api('POST', '/v2/text-to-3d', body));
      e.task_preview = r.result; e.credits = (e.credits || 0) + c; used += c; e.status = 'preview'; save(cat);
    }
    await wait(e.task_preview);
    if (!e.task_refine) {
      const [r, c] = await spend(() => api('POST', '/v2/text-to-3d', { mode: 'refine', preview_task_id: e.task_preview, enable_pbr: false, texture_resolution: '2k' }));
      e.task_refine = r.result; e.credits += c; used += c; e.status = 'refine'; save(cat);
    }
    const t = await wait(e.task_refine);
    const url = t.model_urls.glb;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(path.join(WORK, e.name + '.glb'), buf);
    e.status = 'done'; save(cat);
    console.log(e.name, 'ok', e.credits, 'crediti; saldo', await balance());
  } catch (err) { console.error(e.name, 'ERRORE', err.message); save(cat); if (/402|insufficient/i.test(err.message)) break; }
}
console.log('saldo finale', await balance(), 'consumo sessione', start - await balance());
