import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createBuddyService } from '../src/service.js';
import { createServer } from '../src/server.js';
import { validateAction, executeFileAction } from '../src/files.js';
import { createPlanner } from '../src/planner.js';
import { createLocalOllama } from '../src/ollama.js';
import { desktopCommand } from '../src/desktop.js';

async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'buddy-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = await createBuddyService({ workspace: path.join(dir, 'workspace'), dataDir: path.join(dir, 'data'), ...options });
  return { dir, service, root: path.join(dir, 'workspace') };
}

test('CMD worker creates UTF-8 file, nested directories and never overwrites', async t => {
  const { service, dir, root } = await fixture(t);
  const content = 'Živjo čšž & echo BAD > escape.txt\n%PATH% !name! $(whoami)';
  const result = await service.chat(`/ustvari "zapiski/ideja.txt" ${JSON.stringify(content)}`);
  assert.equal(result.action.status, 'completed');
  assert.equal(await readFile(path.join(root, 'zapiski/ideja.txt'), 'utf8'), content);
  await assert.rejects(service.action({ type: 'create_file', path: 'zapiski/ideja.txt', content: 'novo' }), { status: 409 });
  assert.equal(await readFile(path.join(root, 'zapiski/ideja.txt'), 'utf8'), content);
  const log = await readFile(path.join(dir, 'data/audit.jsonl'), 'utf8');
  assert.ok(!log.includes(content));
  assert.deepEqual(log.trim().split('\n').map(line => JSON.parse(line).status), ['started', 'completed', 'started', 'failed']);
  await assert.rejects(readFile(path.join(root, 'escape.txt')), { code: 'ENOENT' });
});

test('directory command and hover state work without AI', async t => {
  const { service } = await fixture(t);
  assert.equal(service.state().state, 'peeking');
  assert.equal(service.event('hover').state, 'visible');
  assert.equal(service.event('leave').state, 'peeking');
  const result = await service.chat('/mapa "projekti/nov"');
  assert.equal(result.action.type, 'create_directory');
  assert.equal((await service.chat('Kaj znaš?')).action, null);
  assert.throws(() => service.event('execute'), { status: 400 });
});

test('path traversal, Windows special paths, unknown tools and excessive contents rejected', () => {
  for (const value of ['../outside.txt', 'C:/temp/x', 'C:\\temp\\x', '/tmp/x', '//server/x', 'a/../x', 'a//b', 'CON.txt', 'a/NUL', 'a/b. ', 'a:stream', 'a\u0000b', '.', 'COM1.txt', 'LPT¹', 'CONOUT$', 'CONIN$']) {
    assert.throws(() => validateAction({ type: 'create_file', path: value, content: '' }), { status: 400 }, value);
  }
  assert.throws(() => validateAction({ type: 'exec', path: 'ok' }), { status: 400 });
  assert.throws(() => validateAction({ type: 'create_file', path: 'ok', content: '', command: 'dir' }), { status: 400 });
  assert.throws(() => validateAction({ type: 'create_file', path: 'ok', content: 'x'.repeat(32769) }), { status: 400 });
});

test('pre-existing symlink or junction cannot escape workspace', async t => {
  const { root, dir } = await fixture(t);
  const outside = path.join(dir, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(executeFileAction(root, { type: 'create_file', path: 'link/escape.txt', content: 'bad' }), { status: 400 });
  await assert.rejects(readFile(path.join(outside, 'escape.txt')), { code: 'ENOENT' });
});

test('model actions are validated before execution and busy state rejects concurrent tasks', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { service } = await fixture(t, { planner: async () => { await pending; return { reply: 'ok', action: { type: 'exec', path: 'bad' } }; } });
  const task = service.chat('Začni');
  assert.equal(service.state().state, 'thinking');
  await assert.rejects(service.action({ type: 'create_directory', path: 'a' }), { status: 409 });
  release();
  await assert.rejects(task, { status: 502 });
  assert.equal(service.state().lastOutcome, 'error');
  assert.equal(service.state().busy, false);
});

test('valid AI plan executes the worker and reports actual completion', async t => {
  const { service, root } = await fixture(t, { planner: async () => ({ reply: 'Pripravljam.', action: { type: 'create_file', path: 'ai/pozdrav.txt', content: 'Živjo iz modela' } }) });
  const result = await service.chat('Ustvari pozdrav');
  assert.equal(result.action.status, 'completed');
  assert.equal(result.reply, 'Ustvarjeno: ai/pozdrav.txt');
  assert.equal(await readFile(path.join(root, 'ai/pozdrav.txt'), 'utf8'), 'Živjo iz modela');
});

test('Ollama integration sends structured schema and handles malformed replies and outages', async () => {
  const planner = createPlanner({ provider: 'ollama', model: 'test-model', fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/api/show') return Response.json({ details: { format: 'gguf' }, model_info: { architecture: 'qwen3' } });
    assert.equal(url.href, 'http://127.0.0.1:11434/api/chat');
    const request = JSON.parse(options.body);
    assert.equal(request.stream, false);
    assert.equal(request.format.type, 'object');
    assert.equal(request.messages.at(-1).content, 'Vprašanje');
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ reply: 'Odgovor', action: null }) } }));
  } });
  assert.deepEqual(await planner('Vprašanje'), { reply: 'Odgovor', action: null });
  for (const fetchImpl of [async () => new Response('broken'), async () => { throw new Error('offline'); }]) {
    const broken = createPlanner({ provider: 'ollama', model: 'test', fetchImpl });
    await assert.rejects(broken('Vprašanje'), { status: 502 });
  }
});

test('conversation remembers previous turns, isolates sessions and can reset memory', async t => {
  const contexts = [];
  const { service } = await fixture(t, { planner: async (message, context) => {
    contexts.push(context);
    return { reply: message === 'Ime mi je Nejc' ? 'Živjo, Nejc!' : 'Spomnim se.', action: null };
  } });
  await service.chat('Ime mi je Nejc', { conversationId: 'nejc' });
  await service.chat('Kako mi je ime?', { conversationId: 'nejc' });
  assert.equal(contexts[1].history[0].content, 'Ime mi je Nejc');
  assert.equal(contexts[1].history[1].content, 'Živjo, Nejc!');
  await service.chat('Drug uporabnik', { conversationId: 'other' });
  assert.deepEqual(contexts[2].history, []);
  service.resetChat('nejc');
  await service.chat('Nov začetek', { conversationId: 'nejc' });
  assert.deepEqual(contexts[3].history, []);
  assert.throws(() => service.chat('Živjo', { conversationId: '../bad' }), { status: 400 });
});

test('read/list commands and named folders operate locally with bounded text results', async t => {
  const { dir, root } = await fixture(t);
  const documents = path.join(dir, 'documents');
  await mkdir(documents);
  const service = await createBuddyService({ workspace: root, dataDir: path.join(dir, 'data'), folders: { dokumenti: documents } });
  await service.chat('/ustvari "dokumenti/ideja.txt" "Čšž ideja"');
  const read = await service.chat('/preberi "dokumenti/ideja.txt"');
  assert.equal(read.action.content, 'Čšž ideja');
  const listed = await service.chat('/seznam "dokumenti"');
  assert.deepEqual(listed.action.entries, [{ name: 'ideja.txt', type: 'file' }]);
  assert.ok(service.capabilities().folders.includes('dokumenti'));
  await assert.rejects(service.action({ type: 'list_directory', path: '.', folder: 'unknown' }), { status: 400 });
  await writeFile(path.join(root, 'binary'), Buffer.from([0, 1, 2]));
  await assert.rejects(service.action({ type: 'read_file', path: 'binary' }), { status: 400 });
  await writeFile(path.join(root, 'large'), 'x'.repeat(32769));
  await assert.rejects(service.action({ type: 'read_file', path: 'large' }), { status: 400 });
  await assert.rejects(service.action({ type: 'read_file', path: 'missing' }), { status: 404 });
});

test('desktop actions launch only fixed applications and validated existing folders', async t => {
  const { root } = await fixture(t);
  const calls = [];
  const launch = async (...args) => calls.push(args);
  const opened = await executeFileAction(root, { type: 'open_directory', path: '.' }, { launch });
  assert.equal(opened.status, 'launched');
  assert.equal(calls[0][1], root);
  const app = await executeFileAction(root, { type: 'open_app', app: 'calculator' }, { launch });
  assert.equal(app.status, 'launched');
  await assert.rejects(executeFileAction(root, { type: 'open_directory', path: 'missing' }, { launch }), { code: 'ENOENT' });
  assert.throws(() => validateAction({ type: 'open_app', app: 'cmd' }), { status: 400 });
  assert.throws(() => validateAction({ type: 'open_app', app: 'notepad', args: ['evil'] }), { status: 400 });
  const command = desktopCommand({ type: 'open_directory' }, 'C:\\Users\\Nejc\\Mapa & naziv', { platform: 'win32', systemRoot: 'C:\\Windows' });
  assert.equal(command.executable, 'C:\\Windows\\explorer.exe');
  assert.deepEqual(command.args, ['C:\\Users\\Nejc\\Mapa & naziv']);
  assert.throws(() => desktopCommand({ type: 'open_app', app: 'cmd' }, null, { platform: 'win32' }), { status: 400 });
});

test('local-only policy rejects cloud tags, remote metadata and redirects before sending a prompt', async () => {
  assert.throws(() => createLocalOllama({ model: 'qwen3:cloud' }), { status: 400 });
  assert.throws(() => createLocalOllama({ ollamaUrl: 'https://api.example.com' }), { status: 400 });
  const calls = [];
  const local = createLocalOllama({ fetchImpl: async url => {
    calls.push(url.pathname);
    return Response.json({ remote_host: 'https://ollama.com', remote_model: 'other', details: { format: 'gguf' }, model_info: { architecture: 'qwen' } });
  } });
  await assert.rejects(local.chat({ messages: [{ role: 'user', content: 'private' }] }), { status: 502 });
  assert.deepEqual(calls, ['/api/show']);
});

test('clear natural file instructions run without a model decision', async () => {
  const planner = createPlanner({ provider: 'ollama', fetchImpl: async () => { throw new Error('This command must not call AI'); } });
  assert.deepEqual((await planner('Preberi datoteko test.txt.')).action, { type: 'read_file', path: 'test.txt' });
  assert.deepEqual((await planner('Odpri dokumente.', { folders: ['workspace', 'dokumenti'] })).action, { type: 'open_directory', folder: 'dokumenti', path: '.' });
  assert.deepEqual((await planner('Kaj je v mapi prenosi?', { folders: ['workspace', 'prenosi'] })).action, { type: 'list_directory', folder: 'prenosi', path: '.' });
  assert.deepEqual((await planner('Preberi datoteko "ime s presledkom.txt".')).action, { type: 'read_file', path: 'ime s presledkom.txt' });
  await assert.rejects(planner('Preberi datoteko ../outside.txt.'), { status: 400 });
});

test('HTTP requires local host, bearer token and rejects browser origins, bad JSON and large bodies', async t => {
  const { service, root } = await fixture(t);
  const token = 't'.repeat(64);
  const server = createServer({ service, token });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/health`)).status, 401);
  assert.equal((await fetch(`${base}/health`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/health`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    http.get(`${base}/health`, { headers: { ...headers, Host: 'evil.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: 'null' })).status, 400);
  assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: 'x'.repeat(70000) })).status, 413);
  const response = await fetch(`${base}/actions`, { method: 'POST', headers, body: JSON.stringify({ type: 'create_file', path: 'api.txt', content: 'Iz API' }) });
  assert.equal(response.status, 200, await response.text());
  assert.equal(await readFile(path.join(root, 'api.txt'), 'utf8'), 'Iz API');
  assert.equal((await fetch(`${base}/unknown`, { headers })).status, 404);
});
