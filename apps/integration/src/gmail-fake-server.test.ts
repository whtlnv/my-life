import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { pollGmailOnce } from '@my-life/extension/gmail-poll';

import { startGmailFakeServer } from './gmail-fake-server';

const accountEmail = 'ana@example.com';
const backendUrl = 'http://backend.test';
const triageTime = new Date('2026-11-02T15:10:00.000Z');

const actionProposal = {
  action: 'act',
  category: 'action',
  summary: 'Luis asks for a budget review',
  extract: { asker: 'Luis', ask: 'Review the budget' },
  reason: 'Luis asks the user directly',
};

const ccThreadProposal = {
  action: 'archive',
  category: 'cc-thread',
  summary: 'Marta and Diego moved the launch review',
  extract: { sinceLastMessage: 'Marta and Diego agreed to move the launch review to next Tuesday.' },
  reason: 'The user is only copied',
};

const expenseProposal = {
  action: 'archive',
  category: 'expense',
  summary: 'Receipt from Papelería Central',
  extract: { vendor: 'Papelería Central', amount: 1250.5, currency: 'MXN', date: '2026-11-02' },
  reason: 'A receipt for a purchase',
};

type Backend = ReturnType<typeof createApp>;

interface MessageSeenByTriage {
  id: string;
  from?: string;
  to?: string;
  threadId?: string;
  date?: string;
}

function systemUpdateProposalFor(message: MessageSeenByTriage): object {
  const system = (message.from ?? '').replace(/\s*<.*>$/, '');
  return {
    action: 'archive',
    category: 'system-update',
    summary: `Notification from ${system}`,
    extract: { system, severity: 'info', significant: false },
    reason: 'An automated notification',
  };
}

function createBackendProposing(proposalFor: (message: MessageSeenByTriage) => object): {
  backend: Backend;
  messagesSeenByTriage: MessageSeenByTriage[];
} {
  const messagesSeenByTriage: MessageSeenByTriage[] = [];
  const backend = createApp({
    allowedEmails: [accountEmail],
    clock: { now: () => triageTime },
    triage: {
      propose: (message) => {
        messagesSeenByTriage.push(message);
        const proposal = proposalFor(message);
        return Promise.resolve({ proposal, costInUsd: 0, promptVersion: 'triage-v1' });
      },
    },
  });
  return { backend, messagesSeenByTriage };
}

async function pollScenarioIntoBackend(
  scenario: Parameters<typeof startGmailFakeServer>[0],
  backend: Backend,
): Promise<void> {
  const gmail = await startGmailFakeServer(scenario, accountEmail);
  try {
    await pollGmailOnce({
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.origin === 'https://gmail.googleapis.com') {
          return fetch(new URL(url.pathname + url.search, gmail.url), init);
        }
        return backend.request(url.pathname, init);
      },
      accessToken: 'fake-token',
      accountEmail,
      backendUrl,
      storedHistoryId: undefined,
    });
  } finally {
    await gmail.close();
  }
}

async function runTriageAndReadQueue<Queue>(backend: Backend): Promise<Queue> {
  await backend.request('/triage-run', { method: 'POST' });
  return (await (await backend.request('/triage-queue')).json()) as Queue;
}

describe('Gmail fake server', () => {
  it('polling the action-to-me scenario puts the message, addressed to the user, in the action block of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => actionProposal);
    await pollScenarioIntoBackend('action-to-me', backend);
    const queue = await runTriageAndReadQueue<{
      action: { messageId: string; category: string; accountEmail: string }[];
    }>(backend);

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(messagesSeenByTriage[0]?.to).toContain(accountEmail);
    expect(queue.action).toEqual([
      expect.objectContaining({ messageId: messagesSeenByTriage[0]?.id, category: 'action', accountEmail }),
    ]);
  });
  it('polling the cc-thread scenario shows its two messages as one line, the newest, in the cc-thread group of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => ccThreadProposal);
    await pollScenarioIntoBackend('cc-thread', backend);
    const queue = await runTriageAndReadQueue<{
      groups: { category: string; count: number; items: { messageId: string }[] }[];
    }>(backend);
    const [newest, older] = [...messagesSeenByTriage].sort(
      (first, second) => Date.parse(second.date ?? '') - Date.parse(first.date ?? ''),
    );

    expect(messagesSeenByTriage).toHaveLength(2);
    expect(newest?.threadId).toBe(older?.threadId);
    expect(queue.groups.find(({ category }) => category === 'cc-thread')).toEqual(
      expect.objectContaining({ count: 1, items: [expect.objectContaining({ messageId: newest?.id })] }),
    );
  });
  it('polling the expense scenario shows the receipt with its amount in the expense group of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => expenseProposal);
    await pollScenarioIntoBackend('expense', backend);
    const queue = await runTriageAndReadQueue<{
      groups: { category: string; items: { messageId: string; extract: { amount?: number } }[] }[];
    }>(backend);

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(queue.groups.find(({ category }) => category === 'expense')?.items).toEqual([
      expect.objectContaining({
        messageId: messagesSeenByTriage[0]?.id,
        extract: expect.objectContaining({ amount: expenseProposal.extract.amount }),
      }),
    ]);
  });
  it('polling the system-update-burst scenario groups its notifications by sending system in the system-update group of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(systemUpdateProposalFor);
    await pollScenarioIntoBackend('system-update-burst', backend);
    const queue = await runTriageAndReadQueue<{
      groups: { category: string; systems?: { system: string; items: { messageId: string }[] }[] }[];
    }>(backend);
    const idsFrom = (system: string) =>
      messagesSeenByTriage.filter(({ from }) => from?.startsWith(system)).map(({ id }) => id);
    const systems = queue.groups.find(({ category }) => category === 'system-update')?.systems ?? [];

    expect(idsFrom('GitHub')).toHaveLength(2);
    expect(idsFrom('Sentry')).toHaveLength(1);
    expect(
      systems.map(({ system, items }) => ({ system, messageIds: items.map(({ messageId }) => messageId).sort() })),
    ).toEqual(
      expect.arrayContaining([
        { system: 'GitHub', messageIds: idsFrom('GitHub').sort() },
        { system: 'Sentry', messageIds: idsFrom('Sentry').sort() },
      ]),
    );
    expect(systems).toHaveLength(2);
  });
});
