import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type GmailScenario = 'action-to-me';

function scenarioMessages(scenario: GmailScenario, accountEmail: string) {
  const messages: Record<GmailScenario, unknown[]> = {
    'action-to-me': [
      {
        id: 'budget-review',
        threadId: 'budget-review',
        snippet: 'Could you review the budget before Friday?',
        payload: {
          headers: [
            { name: 'From', value: 'Luis <luis@example.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Budget review' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 09:00:00 -0600' },
          ],
        },
      },
    ],
  };
  return messages[scenario];
}

export async function startGmailFakeServer(scenario: GmailScenario, accountEmail: string) {
  const messages = scenarioMessages(scenario, accountEmail) as { id: string; threadId: string }[];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fake').pathname;
    const prefix = '/gmail/v1/users/me';
    let body: unknown;
    if (path === `${prefix}/profile`) {
      body = { historyId: '1' };
    } else if (path === `${prefix}/messages`) {
      body = { messages: messages.map(({ id, threadId }) => ({ id, threadId })) };
    } else {
      body = messages.find(({ id }) => path === `${prefix}/messages/${id}`);
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
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
