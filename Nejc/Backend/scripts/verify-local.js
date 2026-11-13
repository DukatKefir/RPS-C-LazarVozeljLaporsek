import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createBuddyService } from '../src/service.js';
import { createServer } from '../src/server.js';
import { createBuddyClient } from '../examples/backend-client.js';

// Real local-model check in a disposable workspace. Never opens desktop apps.
const dir = await mkdtemp(path.join(os.tmpdir(), 'buddy-local-check-'));
let server;
try {
  const service = await createBuddyService({
    workspace: path.join(dir, 'workspace'), dataDir: path.join(dir, 'data'), provider: 'ollama',
    model: process.env.BUDDY_OLLAMA_MODEL || 'qwen3:8b',
    ollamaUrl: process.env.BUDDY_OLLAMA_URL || 'http://127.0.0.1:11434'
  });
  const token = randomBytes(32).toString('hex');
  server = createServer({ service, token });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const client = createBuddyClient({ token, port: server.address().port });
  console.log(await client.aiStatus());
  const first = await client.chat('Živjo! Ime mi je Nejc. Samo na kratko me pozdravi, brez opravila.');
  assert.equal(first.action, null);
  console.log(`Pogovor: ${first.reply}`);
  const followup = await client.chat('Kako mi je ime? Odgovori v enem stavku, brez opravila.');
  assert.equal(followup.action, null);
  assert.match(followup.reply, /nejc/iu);
  console.log(`Spomin: ${followup.reply}`);
  const created = await client.chat('Ustvari datoteko test.txt z natančno vsebino: Živjo iz lokalnega Buddyja');
  assert.equal(created.action?.type, 'create_file');
  assert.equal(await readFile(path.join(dir, 'workspace/test.txt'), 'utf8'), 'Živjo iz lokalnega Buddyja');
  console.log(`Opravilo: ${created.reply}`);
  const read = await client.chat('Preberi datoteko test.txt.');
  console.log(`Branje: ${read.reply}`);
  assert.equal(read.action?.type, 'read_file');
  assert.equal(read.action.content, 'Živjo iz lokalnega Buddyja');
  console.log('Dejanski lokalni pogovor, spomin, API in opravila so preverjeni.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await rm(dir, { recursive: true, force: true });
}
