import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, readFile, writeFile, stat } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createLocalOllama } from '../src/ollama.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const model = process.env.BUDDY_OLLAMA_MODEL || 'qwen3:8b';
const ollamaUrl = process.env.BUDDY_OLLAMA_URL || 'http://127.0.0.1:11434';
const local = createLocalOllama({ model, ollamaUrl });
const env = { ...process.env, OLLAMA_HOST: new URL(ollamaUrl).host, OLLAMA_NO_CLOUD: '1' };

async function findOllama() {
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe'), 'ollama.exe'
  ] : ['ollama'];
  for (const candidate of candidates) {
    try { execFileSync(candidate, ['--version'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); return candidate; }
    catch { /* Try the next installation path. */ }
  }
  throw new Error('Najprej namesti brezplacno Ollama: https://ollama.com/download . Na Windows lahko uporabis: winget install --id Ollama.Ollama --exact --scope user');
}

async function isRunning() {
  try { return (await fetch(new URL('/api/tags', ollamaUrl), { redirect: 'error', signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
}

async function defaultFolders() {
  let candidates = { prenosi: path.join(os.homedir(), 'Downloads') };
  if (process.platform === 'win32') {
    try {
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); [pscustomobject]@{namizje=[Environment]::GetFolderPath('Desktop');dokumenti=[Environment]::GetFolderPath('MyDocuments')} | ConvertTo-Json -Compress"], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      candidates = { ...candidates, ...JSON.parse(output.replace(/^\uFEFF/u, '')) };
    } catch { console.log('Namizja in dokumentov ni bilo mogoce zaznati; mape lahko dodas v BUDDY_FOLDERS.'); }
  }
  const result = {};
  for (const [alias, directory] of Object.entries(candidates)) {
    try { if (directory && (await stat(directory)).isDirectory()) result[alias] = directory; } catch { /* Optional folder. */ }
  }
  return result;
}

try {
  const executable = await findOllama();
  if (!await isRunning()) {
    console.log('Zaganjam lokalni modelni streznik brez oblacnih funkcij ...');
    const server = spawn(executable, ['serve'], { env, detached: true, windowsHide: true, stdio: 'ignore' });
    server.on('error', error => console.error(error.message));
    server.unref();
    for (let attempt = 0; attempt < 30 && !await isRunning(); attempt++) await setTimeout(1000);
    if (!await isRunning()) throw new Error('Ollama se ni zagnala. Preveri namestitev in vrata 11434.');
  }
  console.log(`Pripravljam lokalni model ${model}. Prvi prenos potrebuje internet in lahko traja nekaj minut.`);
  await new Promise((resolve, reject) => {
    const pull = spawn(executable, ['pull', model], { env, windowsHide: true, stdio: 'inherit', shell: false });
    pull.once('error', reject);
    pull.once('exit', code => code === 0 ? resolve() : reject(new Error('Prenos modela ni uspel.')));
  });
  await local.checkLocal();
  const filename = path.join(project, '.env');
  let contents;
  try { await access(filename); contents = await readFile(filename, 'utf8'); }
  catch { contents = await readFile(path.join(project, '.env.example'), 'utf8'); }
  const folders = { ...await defaultFolders(), ...JSON.parse(process.env.BUDDY_FOLDERS || '{}') };
  const settings = {
    BUDDY_AI_PROVIDER: 'ollama', BUDDY_OLLAMA_MODEL: model, BUDDY_OLLAMA_URL: ollamaUrl,
    BUDDY_TOKEN: process.env.BUDDY_TOKEN || randomBytes(32).toString('hex'),
    BUDDY_FOLDERS: `'${JSON.stringify(folders).replaceAll("'", '\\u0027')}'`
  };
  for (const [key, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${key}=.*$`, 'mu');
    contents = pattern.test(contents) ? contents.replace(pattern, () => `${key}=${value}`) : `${contents}\n${key}=${value}\n`;
  }
  await writeFile(filename, contents, { mode: 0o600 });
  console.log(`Pripravljeno. Dovoljene mape: workspace, ${Object.keys(folders).join(', ') || '(brez dodatnih map)'}.`);
  console.log('Zazeni npm start, nato v drugem terminalu npm run chat. Placljiv API ali racun nista potrebna.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
