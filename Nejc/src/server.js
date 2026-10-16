import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { BuddyError } from './files.js';

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new BuddyError('Zahtevan je application/json.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 65536) { req.resume(); throw new BuddyError('Zahteva je prevelika.', 413); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BuddyError('Neveljaven JSON.'); }
}

export function createServer({ service, token }) {
  if (typeof token !== 'string' || token.length < 32 || /\s/u.test(token)) throw new Error('BUDDY_TOKEN mora imeti vsaj 32 znakov brez presledkov.');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      // A desktop main process sends no Origin; browser pages cannot use this API.
      if (req.headers.origin) throw new BuddyError('Dostop iz spletne strani ni dovoljen.', 403);
      const port = server.address()?.port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) throw new BuddyError('Neveljaven gostitelj.', 403);
      const supplied = Buffer.from(req.headers.authorization ?? '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new BuddyError('Neveljaven dostopni zeton.', 401);
      if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
      if (req.method === 'GET' && req.url === '/buddy') return send(200, service.state());
      if (req.method === 'GET' && req.url === '/capabilities') return send(200, service.capabilities());
      if (req.method === 'GET' && req.url === '/ai/status') return send(200, await service.aiStatus());
      if (req.method === 'POST' && ['/chat', '/chat/reset', '/actions', '/buddy/events'].includes(req.url)) {
        const body = await readJson(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BuddyError('Telo mora biti objekt.');
        if (req.url === '/chat') return send(200, await service.chat(body.message, { conversationId: body.conversationId }));
        if (req.url === '/chat/reset') return send(200, service.resetChat(body.conversationId));
        if (req.url === '/actions') return send(200, await service.action(body));
        return send(200, service.event(body.event));
      }
      throw new BuddyError('Pot ali metoda ne obstaja.', 404);
    } catch (error) { send(error.status ?? 500, { error: error.status ? error.message : 'Notranja napaka. Preveri dostop do delovne mape in dnevnika.' }); }
  });
  server.requestTimeout = 140000;
  server.headersTimeout = 10000;
  return server;
}
