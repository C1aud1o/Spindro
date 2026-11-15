// Minimal static file server for the repo root (no dependencies, no build). Used by `npm run dev`, the tests and `npm run game:check`.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.gpx': 'application/gpx+xml', '.glb': 'model/gltf-binary',
};

/** Starts the server on `port` (0 = any free port) and resolves with { server, port, url }. */
export function startServer(port = 0, host = '127.0.0.1') {
  const server = http.createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (p.endsWith('/')) p += 'index.html';
      const file = join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, () => { const { port: p } = server.address(); ok({ server, port: p, url: `http://${host}:${p}` }); }); });
}
