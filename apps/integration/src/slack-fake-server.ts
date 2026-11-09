import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type SlackScenario = 'direct-message';

export const directMessageText = 'Can you review the proposal today?';

const scenarios: Record<SlackScenario, { conversationsList: unknown; conversationsHistory: unknown }> = {
  'direct-message': {
    conversationsList: { ok: true, channels: [{ id: 'D0001', is_im: true, user: 'U0001' }] },
    conversationsHistory: {
      ok: true,
      messages: [{ type: 'message', user: 'U0001', text: directMessageText, ts: '1762700000.000100' }],
    },
  },
};

export async function startSlackFakeServer(scenario: SlackScenario) {
  const { conversationsList, conversationsHistory } = scenarios[scenario];
  const responseByPath: Record<string, unknown> = {
    '/conversations.list': conversationsList,
    '/conversations.history': conversationsHistory,
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fake').pathname;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(responseByPath[path]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
}
