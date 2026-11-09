import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type SlackScenario = 'direct-message' | 'mention';

export const directMessageText = 'Can you review the proposal today?';

export const userId = 'U0000';

export const mentionMessageText = `<@${userId}> can you join the launch call?`;

const responseByPathByScenario: Record<SlackScenario, Record<string, unknown>> = {
  'direct-message': {
    '/conversations.list': { ok: true, channels: [{ id: 'D0001', is_im: true, user: 'U0001' }] },
    '/conversations.history': {
      ok: true,
      messages: [{ type: 'message', user: 'U0001', text: directMessageText, ts: '1762700000.000100' }],
    },
  },
  mention: {
    '/search.messages': {
      ok: true,
      messages: {
        matches: [
          {
            text: mentionMessageText,
            user: 'U0002',
            ts: '1762700100.000200',
            channel: { id: 'C0001', is_im: false },
          },
        ],
      },
    },
  },
};

export async function startSlackFakeServer(scenario: SlackScenario) {
  const responseByPath = responseByPathByScenario[scenario];
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
