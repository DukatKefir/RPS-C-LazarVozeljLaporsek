import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, realpath, stat } from 'node:fs/promises';
import { BuddyError, prepareRoot, validateAction, actionTypes } from './files.js';
import { createPlanner, validatePlan } from './planner.js';

export function runWorker(root, action) {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('./worker.js', import.meta.url));
    // Windows CMD receives a fixed command only. Paths/content from the request
    // are JSON on stdin and never take part in the command string.
    const windows = process.platform === 'win32';
    if (windows && [process.execPath, script].some(value => /["%!^&|<>\r\n]/u.test(value))) {
      return reject(new BuddyError('Namestitvena pot vsebuje znake, ki niso podprti za CMD.', 500));
    }
    const executable = windows ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe') : process.execPath;
    const args = windows ? ['/d', '/s', '/c', `""${process.execPath}" "${script}""`] : [script];
    const child = spawn(executable, args, {
      windowsVerbatimArguments: windows,
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 524288) child.kill(); });
    child.on('error', () => reject(new BuddyError('Zagon opravila ni uspel.', 500)));
    child.stdin.on('error', () => {});
    child.on('close', code => {
      try {
        const parsed = JSON.parse(output);
        if (code !== 0 || parsed.error || !parsed.result) return reject(new BuddyError(parsed.error ?? 'Opravilo ni uspelo.', parsed.status ?? 500));
        resolve(parsed.result);
      } catch { reject(new BuddyError('Opravilo se ni pravilno zakljucilo.', 500)); }
    });
    child.stdin.end(JSON.stringify({ root, action }));
  });
}

export async function createBuddyService({ workspace, dataDir, planner, folders = {}, ...aiOptions }) {
  const root = await prepareRoot(path.resolve(workspace));
  if (!folders || typeof folders !== 'object' || Array.isArray(folders) || Object.keys(folders).length > 20) throw new BuddyError('Dovoljene mape morajo biti objekt z najvec 20 vnosi.');
  const roots = new Map([['workspace', root]]);
  for (const [alias, directory] of Object.entries(folders)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(alias) || alias === 'workspace' || typeof directory !== 'string') throw new BuddyError('Neveljavna nastavitev dovoljene mape.');
    const canonical = await realpath(path.resolve(directory));
    if (!(await stat(canonical)).isDirectory() || canonical.startsWith('\\\\')) throw new BuddyError('Dovoljena mapa mora biti lokalna mapa.');
    roots.set(alias, canonical);
  }
  await mkdir(dataDir, { recursive: true });
  const planMessage = planner ?? createPlanner(aiOptions);
  const conversations = new Map();
  function conversationKey(value = 'default') {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/u.test(value)) throw new BuddyError('Neveljaven conversationId (1 do 64 crk, stevilk, _ ali -).');
    return value;
  }
  function remember(key, message, reply) {
    const turns = [...(conversations.get(key) ?? []), { role: 'user', content: message }, { role: 'assistant', content: reply.slice(0, 12000) }];
    while (turns.length > 40 || turns.reduce((sum, turn) => sum + turn.content.length, 0) > 24000) turns.splice(0, 2);
    conversations.delete(key);
    conversations.set(key, turns);
    if (conversations.size > 50) conversations.delete(conversations.keys().next().value);
  }
  function actionReply(action) {
    const location = action.folder ? `${action.folder}/${action.path}` : action.path;
    if (action.type === 'open_app') return `Poslana je zahteva za zagon aplikacije ${action.app === 'notepad' ? 'Beležnica' : 'Kalkulator'}.`;
    if (action.type === 'open_directory') return `Poslana je zahteva za odpiranje mape ${location} v Raziskovalcu.`;
    if (action.type === 'read_file') return `Vsebina ${location}:\n${action.content}`;
    if (action.type === 'list_directory') return `V mapi ${location}:\n${action.entries.map(entry => `${entry.type === 'directory' ? '[mapa]' : entry.type === 'link' ? '[povezava]' : '[datoteka]'} ${entry.name}`).join('\n') || '(mapa je prazna)'}${action.truncated ? '\nPrikazanih je prvih 200 vnosov.' : ''}`;
    return `Ustvarjeno: ${location}`;
  }
  let busy = false;
  let visible = false;
  let lastOutcome = null;
  const state = () => ({ state: busy ? 'thinking' : visible ? 'visible' : 'peeking', busy, lastOutcome });
  const audit = record => appendFile(path.join(dataDir, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n', { mode: 0o600 });
  async function execute(rawAction) {
    const action = validateAction(rawAction);
    const selectedRoot = roots.get(action.folder ?? 'workspace');
    if (!selectedRoot) throw new BuddyError('Ta mapa ni med dovoljenimi mapami.');
    const id = randomUUID();
    // Fail before mutation if the audit destination is unavailable.
    await audit({ id, type: action.type, status: 'started' });
    let result;
    try { result = await runWorker(selectedRoot, action); }
    catch (error) {
      await audit({ id, type: action.type, status: 'failed' });
      throw error;
    }
    try { await audit({ id, type: action.type, status: 'completed' }); }
    catch { return { id, ...result, warning: 'Opravilo je uspelo, zapis zakljucka v dnevnik pa ni uspel.' }; }
    return { id, ...result };
  }
  async function exclusive(task) {
    if (busy) throw new BuddyError('Buddy ze izvaja opravilo. Poskusi znova po zakljucku.', 409);
    busy = true;
    try { const result = await task(); lastOutcome = 'success'; return result; }
    catch (error) { lastOutcome = 'error'; throw error; }
    finally { busy = false; }
  }
  return {
    state,
    capabilities: () => ({ localOnly: true, folders: [...roots.keys()], actions: actionTypes, apps: ['notepad', 'calculator'], history: 'memory' }),
    aiStatus: async () => planMessage.status ? planMessage.status() : { ready: false, provider: 'custom', localOnly: true },
    resetChat(conversationId) {
      if (busy) throw new BuddyError('Pocakaj na zakljucek trenutnega opravila.', 409);
      const key = conversationKey(conversationId);
      conversations.delete(key);
      return { conversationId: key, status: 'cleared' };
    },
    event(event) {
      if (!['hover', 'leave'].includes(event)) throw new BuddyError('Dogodek mora biti hover ali leave.');
      visible = event === 'hover';
      return state();
    },
    action: action => exclusive(() => execute(action)),
    chat(message, { conversationId } = {}) {
      if (typeof message !== 'string' || !message.trim() || message.length > 8000) throw new BuddyError('Sporocilo mora vsebovati od 1 do 8000 znakov.');
      const key = conversationKey(conversationId);
      return exclusive(async () => {
        try {
          const history = (conversations.get(key) ?? []).map(turn => ({ ...turn }));
          const plan = validatePlan(await planMessage(message, { history, folders: [...roots.keys()] }));
          const action = plan.action ? await execute(plan.action) : null;
          const reply = action ? actionReply(action) : plan.reply;
          remember(key, message, reply);
          return { reply, action, conversationId: key };
        } catch (error) {
          remember(key, message, `Zahteva ni uspela: ${error.status ? error.message : 'notranja napaka'}. Opravilo ni potrjeno kot uspesno.`);
          throw error;
        }
      });
    }
  };
}
