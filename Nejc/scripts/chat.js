import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createBuddyClient } from '../examples/backend-client.js';

const terminal = createInterface({ input: stdin, output: stdout });
try {
  const token = process.env.BUDDY_TOKEN || await terminal.question('Prilepi zacasni zeton iz backend terminala: ');
  const client = createBuddyClient({ token, port: Number(process.env.BUDDY_PORT || 43123) });
  await client.health();
  console.log('Buddy je povezan. /nov zacne nov pogovor, /izhod zakljuci.');
  while (true) {
    let message;
    try { message = (await terminal.question('Ti: ')).trim(); } catch { break; }
    if (message === '/izhod') break;
    if (!message) continue;
    try {
      if (message === '/nov') { await client.resetChat(); console.log('Buddy: Zacenjava nov pogovor.'); continue; }
      const result = await client.chat(message);
      console.log(`Buddy: ${result.reply}`);
      if (result.action?.warning) console.log(result.action.warning);
    } catch (error) { console.log(`Buddy: ${error.message}`); }
  }
} catch (error) { console.error(`Povezava ni uspela: ${error.message}. Preveri, ali npm start tece.`); process.exitCode = 1; }
finally { terminal.close(); }
