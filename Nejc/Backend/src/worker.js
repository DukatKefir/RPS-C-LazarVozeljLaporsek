import { executeFileAction } from './files.js';

// Fixed executable and script; user data travels only through stdin.
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 65536) throw new Error('Preveliko opravilo.');
  }
  const { root, action } = JSON.parse(input);
  const result = await executeFileAction(root, action);
  process.stdout.write(JSON.stringify({ result }));
} catch (error) {
  const missing = error.code === 'ENOENT';
  process.stdout.write(JSON.stringify({ error: error.status ? error.message : missing ? 'Mapa ali datoteka ne obstaja.' : 'Datotecno opravilo ni uspelo.', status: error.status ?? (missing ? 404 : 500) }));
  process.exitCode = 1;
}
