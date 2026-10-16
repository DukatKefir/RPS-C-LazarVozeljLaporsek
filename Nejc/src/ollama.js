import { BuddyError } from './files.js';

export function createLocalOllama({ ollamaUrl = 'http://127.0.0.1:11434', model = 'qwen3:8b', fetchImpl = fetch } = {}) {
  const url = new URL(ollamaUrl);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new BuddyError('Ollama mora uporabljati lokalni HTTP naslov brez dodatne poti.');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/u.test(model) || /cloud/iu.test(model)) throw new BuddyError('Izberi lokalni model, npr. qwen3:8b. Oblacni modeli niso dovoljeni.');
  async function request(route, body, timeout = 15000) {
    try {
      const response = await fetchImpl(new URL(route, url), {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout), body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Ollama HTTP failure');
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 2 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('AI response too large'); }
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof BuddyError) throw error;
      throw new BuddyError('Lokalna Ollama ni dosegljiva, model manjka ali je odgovor neveljaven. Zazeni npm run doctor.', 502);
    }
  }
  async function checkLocal() {
    const info = await request('/api/show', { model });
    if (info.remote_host || info.remote_model || info.details?.format !== 'gguf' || !info.model_info || !Object.keys(info.model_info).length) {
      throw new BuddyError('Ta model ni potrjen kot lokalni GGUF model. Zahteva ni bila poslana modelu.', 502);
    }
    return { ready: true, provider: 'ollama', model, localOnly: true };
  }
  return {
    checkLocal,
    async chat(body) {
      // Verify before EVERY request, so reassigning a model tag cannot silently
      // turn a local conversation into a cloud request.
      await checkLocal();
      const response = await request('/api/chat', { ...body, model, stream: false, think: false, keep_alive: '5m' }, 120000);
      if (response.remote_host || response.remote_model) throw new BuddyError('Oblacni odgovor je zavrnjen.', 502);
      return response;
    }
  };
}
