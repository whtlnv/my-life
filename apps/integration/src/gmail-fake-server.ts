import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type GmailScenario = 'action-to-me' | 'cc-thread' | 'expense';

interface FakeGmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: { headers: { name: string; value: string }[] };
}

function scenarioMessages(scenario: GmailScenario, accountEmail: string): FakeGmailMessage[] {
  const messages: Record<GmailScenario, FakeGmailMessage[]> = {
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
    'cc-thread': [
      {
        id: 'launch-review-first',
        threadId: 'launch-review',
        snippet: 'Can we move the launch review?',
        payload: {
          headers: [
            { name: 'From', value: 'Marta <marta@example.com>' },
            { name: 'To', value: 'Diego <diego@example.com>' },
            { name: 'Cc', value: accountEmail },
            { name: 'Subject', value: 'Launch review' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 10:00:00 -0600' },
          ],
        },
      },
      {
        id: 'launch-review-reply',
        threadId: 'launch-review',
        snippet: 'Next Tuesday works for me.',
        payload: {
          headers: [
            { name: 'From', value: 'Diego <diego@example.com>' },
            { name: 'To', value: 'Marta <marta@example.com>' },
            { name: 'Cc', value: accountEmail },
            { name: 'Subject', value: 'Re: Launch review' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 11:00:00 -0600' },
          ],
        },
      },
    ],
    expense: [
      {
        id: 'papeleria-receipt',
        threadId: 'papeleria-receipt',
        snippet: 'Your receipt for MXN 1,250.50',
        payload: {
          headers: [
            { name: 'From', value: 'Papelería Central <recibos@papeleria.example.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Your receipt' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 12:00:00 -0600' },
          ],
        },
      },
    ],
  };
  return messages[scenario];
}

export async function startGmailFakeServer(scenario: GmailScenario, accountEmail: string) {
  const messages = scenarioMessages(scenario, accountEmail);
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
