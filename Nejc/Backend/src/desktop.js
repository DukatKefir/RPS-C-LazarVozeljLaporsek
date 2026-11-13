import path from 'node:path';
import { spawn } from 'node:child_process';

export function desktopCommand(action, target, { platform = process.platform, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (platform !== 'win32') throw Object.assign(new Error('Odpiranje map in aplikacij je podprto na Windows.'), { status: 501 });
  if (action.type === 'open_directory' && path.win32.isAbsolute(target) && !target.startsWith('\\\\')) {
    return { executable: path.win32.join(systemRoot, 'explorer.exe'), args: [target] };
  }
  const apps = { notepad: 'notepad.exe', calculator: 'calc.exe' };
  if (action.type === 'open_app' && Object.hasOwn(apps, action.app)) {
    return { executable: path.win32.join(systemRoot, 'System32', apps[action.app]), args: [] };
  }
  throw Object.assign(new Error('Nedovoljeno namizno opravilo.'), { status: 400 });
}

export async function launchDesktop(action, target) {
  const { executable, args } = desktopCommand(action, target);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
    child.once('error', () => reject(Object.assign(new Error('Aplikacije ni bilo mogoce zagnati.'), { status: 500 })));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
