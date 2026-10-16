// Use from Electron's main process or another trusted Node.js process.
// Never ship the token to a browser renderer.
import { randomUUID } from 'node:crypto';

export function createBuddyClient({ token, port = 43123, conversationId = randomUUID() }) {
  async function request(route, body) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(140000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  return {
    health: () => request('/health'),
    chat: message => request('/chat', { message, conversationId }),
    resetChat: () => request('/chat/reset', { conversationId }),
    capabilities: () => request('/capabilities'),
    aiStatus: () => request('/ai/status'),
    state: () => request('/buddy'),
    hover: () => request('/buddy/events', { event: 'hover' }),
    leave: () => request('/buddy/events', { event: 'leave' })
  };
}
