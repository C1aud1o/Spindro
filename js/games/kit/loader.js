// Caricamento dei modelli glTF con cache: ogni file si scarica e si decodifica una volta sola.
// I .glb ottimizzati usano EXT_meshopt_compression (decoder MIT in vendor/three/addons/libs).
import { GLTFLoader } from '../../../vendor/three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../../vendor/three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// path relativo al documento (es. 'assets/3d/quaternius/cyclist.glb')
// Alcuni file Meshy hanno normali di lunghezza zero (facce degeneri): nello shader diventano NaN e il bagliore
// (bloom) allarga il nero su tutto lo schermo. Si sostituiscono con "verso l'alto".
function fixNormals(gltf) {
  gltf.scene.traverse((o) => {
    const n = o.geometry?.attributes?.normal; if (!n) return;
    let bad = false;
    for (let i = 0; i < n.count; i++) { const x = n.getX(i); const y = n.getY(i); const z = n.getZ(i); if (!(x * x + y * y + z * z > 1e-4)) { n.setXYZ(i, 0, 1, 0); bad = true; } }
    if (bad) n.needsUpdate = true;
  });
  return gltf;
}

export function loadGLTF(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(path).then((g) => (path.includes('/meshy/') ? fixNormals(g) : g)).catch((err) => { cache.delete(path); throw err; }));
  return cache.get(path);
}

// carica una mappa { nome: percorso } e riporta l'avanzamento (0..1)
export async function loadAll(map, onProgress) {
  const out = {}; let done = 0; const entries = Object.entries(map);
  await Promise.all(entries.map(async ([k, p]) => { out[k] = await loadGLTF(p); done++; onProgress?.(done / entries.length); }));
  return out;
}
