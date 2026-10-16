import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createBuddyService } from './service.js';
import { createServer } from './server.js';

const project = fileURLToPath(new URL('../', import.meta.url));
try {
  const port = Number(process.env.BUDDY_PORT ?? 43123);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('BUDDY_PORT mora biti med 1024 in 65535.');
  const token = process.env.BUDDY_TOKEN || randomBytes(32).toString('hex');
  const service = await createBuddyService({
    workspace: path.resolve(project, process.env.BUDDY_WORKSPACE || 'workspace'),
    dataDir: path.resolve(project, process.env.BUDDY_DATA || 'data'),
    folders: JSON.parse(process.env.BUDDY_FOLDERS || '{}'),
    provider: process.env.BUDDY_AI_PROVIDER || 'ollama',
    ollamaUrl: process.env.BUDDY_OLLAMA_URL || 'http://127.0.0.1:11434',
    model: process.env.BUDDY_OLLAMA_MODEL || 'qwen3:8b'
  });
  const server = createServer({ service, token });
  server.on('error', error => { console.error(`Backend se ni zagnal: ${error.code ?? error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Desktop Buddy backend: http://127.0.0.1:${port}`);
    if (!process.env.BUDDY_TOKEN) console.log(`Zacasni lokalni zeton: ${token}`);
  });
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) { console.error(`Backend se ni zagnal: ${error.message}`); process.exitCode = 1; }
