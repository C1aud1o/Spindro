// Static server for the tests: serves the repo root (see scripts/static-server.mjs).
import { startServer } from '../scripts/static-server.mjs';

const { url } = await startServer(Number(process.env.PORT) || 4173);
console.log(`Test server at ${url}`);
