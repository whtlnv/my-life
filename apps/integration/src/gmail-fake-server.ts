import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type GmailScenario =
  | 'action-to-me'
  | 'cc-thread'
  | 'expense'
  | 'system-update-burst'
  | 'sales-pitch'
  | 'calendar-notification'
  | 'history-404';

interface FakeGmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: { headers: { name: string; value: string }[] };
}

function scenarioMessages(scenario: GmailScenario, accountEmail: string): FakeGmailMessage[] {
  const budgetReview: FakeGmailMessage = {
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
  };
  const messages: Record<GmailScenario, FakeGmailMessage[]> = {
    'action-to-me': [budgetReview],
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
    'system-update-burst': [
      {
        id: 'github-build-passed',
        threadId: 'github-build-passed',
        snippet: 'Your build passed',
        payload: {
          headers: [
            { name: 'From', value: 'GitHub <noreply@github.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Build passed' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 13:00:00 -0600' },
          ],
        },
      },
      {
        id: 'github-pull-request-merged',
        threadId: 'github-pull-request-merged',
        snippet: 'Your pull request was merged',
        payload: {
          headers: [
            { name: 'From', value: 'GitHub <noreply@github.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Pull request merged' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 13:05:00 -0600' },
          ],
        },
      },
      {
        id: 'sentry-weekly-report',
        threadId: 'sentry-weekly-report',
        snippet: 'Your weekly error report',
        payload: {
          headers: [
            { name: 'From', value: 'Sentry <noreply@sentry.io>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Weekly report' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 13:10:00 -0600' },
          ],
        },
      },
    ],
    'sales-pitch': [
      {
        id: 'nubeforma-pitch',
        threadId: 'nubeforma-pitch',
        snippet: 'Stop capturing invoices by hand',
        payload: {
          headers: [
            { name: 'From', value: 'Nubeforma <ventas@nubeforma.example.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Invoice automation for your team' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 14:00:00 -0600' },
          ],
        },
      },
    ],
    'calendar-notification': [
      {
        id: 'launch-review-moved',
        threadId: 'launch-review-moved',
        snippet: 'Launch review has been updated',
        payload: {
          headers: [
            { name: 'From', value: 'Google Calendar <calendar-notification@google.com>' },
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: 'Updated invitation: Launch review' },
            { name: 'Date', value: 'Mon, 2 Nov 2026 15:00:00 -0600' },
          ],
        },
      },
    ],
    'history-404': [budgetReview],
  };
  return messages[scenario];
}

export async function startGmailFakeServer(scenario: GmailScenario, accountEmail: string) {
  const messages = scenarioMessages(scenario, accountEmail);
  const messageLabelIds = new Map(messages.map(({ id }) => [id, ['INBOX']]));
  const labels: { id: string; name: string }[] = [];
  const filters: { id: string }[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fake').pathname;
    const prefix = '/gmail/v1/users/me';
    if (path === `${prefix}/history` && scenario === 'history-404') {
      response.writeHead(404);
      response.end();
      return;
    }
    let requestBody = '';
    request.on('data', (chunk: Buffer) => {
      requestBody += chunk.toString();
    });
    request.on('end', () => {
      let body: unknown;
      if (path === `${prefix}/profile`) {
        body = { historyId: '1' };
      } else if (path === `${prefix}/history`) {
        body = {};
      } else if (path === `${prefix}/labels` && request.method === 'POST') {
        const { name } = JSON.parse(requestBody) as { name: string };
        const label = { id: `label-${String(labels.length + 1)}`, name };
        labels.push(label);
        body = label;
      } else if (path === `${prefix}/labels`) {
        body = { labels };
      } else if (path === `${prefix}/settings/filters` && request.method === 'POST') {
        const filter = { id: `filter-${String(filters.length + 1)}`, ...(JSON.parse(requestBody) as object) };
        filters.push(filter);
        body = filter;
      } else if (path === `${prefix}/settings/filters`) {
        body = { filter: filters };
      } else if (path === `${prefix}/messages`) {
        const inbox = messages.filter(({ id }) => messageLabelIds.get(id)?.includes('INBOX'));
        body = { messages: inbox.map(({ id, threadId }) => ({ id, threadId })) };
      } else if (path.endsWith('/modify')) {
        const messageId = path.slice(`${prefix}/messages/`.length, -'/modify'.length);
        const { addLabelIds, removeLabelIds } = JSON.parse(requestBody) as {
          addLabelIds: string[];
          removeLabelIds: string[];
        };
        const current = messageLabelIds.get(messageId) ?? [];
        messageLabelIds.set(messageId, [...current.filter((id) => !removeLabelIds.includes(id)), ...addLabelIds]);
        body = { id: messageId, labelIds: messageLabelIds.get(messageId) };
      } else {
        const message = messages.find(({ id }) => path === `${prefix}/messages/${id}`);
        body = message && { ...message, labelIds: messageLabelIds.get(message.id) };
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    });
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
