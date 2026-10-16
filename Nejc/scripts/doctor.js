import os from 'node:os';
import { createLocalOllama } from '../src/ollama.js';

console.log(`Node ${process.version}, RAM ${Math.round(os.totalmem() / 1024 ** 3)} GiB`);
try {
  const status = await createLocalOllama({
    model: process.env.BUDDY_OLLAMA_MODEL || 'qwen3:8b',
    ollamaUrl: process.env.BUDDY_OLLAMA_URL || 'http://127.0.0.1:11434'
  }).checkLocal();
  console.log(`Lokalni model je pripravljen: ${status.model}. Pogovori ne potrebujejo placljivega API.`);
} catch (error) {
  console.error(`Model ni pripravljen: ${error.message}`);
  console.error('Namesti Ollama in zazeni npm run setup:local.');
  process.exitCode = 1;
}
