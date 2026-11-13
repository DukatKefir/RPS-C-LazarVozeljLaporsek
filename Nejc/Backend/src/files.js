import path from 'node:path';
import { lstat, realpath, mkdir, open, opendir } from 'node:fs/promises';
import { launchDesktop } from './desktop.js';

export const actionTypes = ['create_file', 'create_directory', 'read_file', 'list_directory', 'open_directory', 'open_app'];

export class BuddyError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new BuddyError('Opravilo mora biti objekt.');
  if (!actionTypes.includes(action.type)) throw new BuddyError('Nepodprto opravilo.');
  if (action.type === 'open_app') {
    if (Object.keys(action).some(key => !['type', 'app'].includes(key)) || !['notepad', 'calculator'].includes(action.app)) throw new BuddyError('Dovoljeni aplikaciji sta notepad in calculator.');
    return { type: action.type, app: action.app };
  }
  const allowed = action.type === 'create_file' ? ['type', 'path', 'content', 'folder'] : ['type', 'path', 'folder'];
  if (Object.keys(action).some(key => !allowed.includes(key))) throw new BuddyError('Neznano polje opravila.');
  const value = action.path;
  if (typeof value !== 'string' || !value || value.length > 220 || /[\\:\x00-\x1f<>"|?*]/u.test(value) || path.posix.isAbsolute(value)) {
    throw new BuddyError('Uporabi relativno pot z lomljenimi crticami, npr. zapiski/ideja.txt.');
  }
  const parts = value.split('/');
  const rootPath = value === '.' && ['list_directory', 'open_directory'].includes(action.type);
  if (!rootPath && parts.some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu.test(part))) {
    throw new BuddyError('Pot vsebuje nedovoljeno ime ali prehod v nadrejeno mapo.');
  }
  if (action.type === 'create_file' && (typeof action.content !== 'string' || Buffer.byteLength(action.content) > 32768)) {
    throw new BuddyError('Vsebina mora biti besedilo do 32 KiB.');
  }
  if (action.folder !== undefined && (typeof action.folder !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/u.test(action.folder))) throw new BuddyError('Neveljavno ime dovoljene mape.');
  return { type: action.type, path: value, ...(action.folder === undefined ? {} : { folder: action.folder }), ...(action.type === 'create_file' ? { content: action.content } : {}) };
}

// Root is selected by the local user, never by the model or HTTP client.
export async function prepareRoot(root) {
  await mkdir(root, { recursive: true });
  return realpath(root);
}

export async function executeFileAction(root, rawAction, { launch = launchDesktop } = {}) {
  const action = validateAction(rawAction);
  if (action.type === 'open_app') {
    await launch(action);
    return { type: action.type, app: action.app, status: 'launched' };
  }
  const canonicalRoot = await realpath(root);
  if (path.resolve(root).toLowerCase() !== canonicalRoot.toLowerCase()) throw new BuddyError('Delovna mapa se je spremenila.', 409);
  const parts = action.path === '.' ? [] : action.path.split('/');
  const isFile = ['create_file', 'read_file'].includes(action.type);
  const directories = isFile ? parts.slice(0, -1) : parts;
  let current = canonicalRoot;
  for (const part of directories) {
    current = path.join(current, part);
    if (['create_file', 'create_directory'].includes(action.type)) {
      try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (await realpath(current)).toLowerCase() !== current.toLowerCase()) {
      throw new BuddyError('Simbolicne povezave in preusmeritve map niso dovoljene.');
    }
  }
  const result = { type: action.type, path: action.path, ...(action.folder === undefined ? {} : { folder: action.folder }), status: 'completed' };
  if (action.type === 'open_directory') {
    await launch(action, current);
    return { ...result, status: 'launched' };
  }
  if (action.type === 'list_directory') {
    const entries = [];
    let truncated = false;
    const dir = await opendir(current);
    for await (const entry of dir) {
      if (entries.length === 200) { truncated = true; break; }
      entries.push({ name: entry.name, type: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' });
    }
    return { ...result, entries, truncated };
  }
  if (action.type === 'read_file') {
    const target = path.join(canonicalRoot, ...parts);
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile() || (await realpath(target)).toLowerCase() !== target.toLowerCase()) throw new BuddyError('Preberem lahko samo navadno besedilno datoteko.');
    const file = await open(target, 'r');
    try {
      if ((await file.stat()).size > 32768) throw new BuddyError('Datoteka je prevelika za branje (najvec 32 KiB).');
      const buffer = Buffer.alloc(32769);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 32768) throw new BuddyError('Datoteka je prevelika za branje (najvec 32 KiB).');
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead)); }
      catch { throw new BuddyError('Datoteka ni besedilo UTF-8.'); }
      if (content.includes('\0')) throw new BuddyError('Binarnih datotek ne berem.');
      return { ...result, content };
    } finally { await file.close(); }
  }
  if (action.type === 'create_file') {
    const target = path.join(canonicalRoot, ...parts);
    let file;
    try {
      file = await open(target, 'wx');
      await file.writeFile(action.content, 'utf8');
    } catch (error) {
      if (error.code === 'EEXIST') throw new BuddyError('Datoteka ze obstaja. Prepisovanje ni dovoljeno.', 409);
      throw error;
    } finally { await file?.close(); }
  }
  return result;
}
