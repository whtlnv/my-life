import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { carryOutArchiveCommands } from '@my-life/extension/gmail-archive';
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

const salesProposal = {
  action: 'keep',
  category: 'sales',
  summary: 'Nubeforma pitches invoice automation',
  extract: { company: 'Nubeforma', solution: 'Invoice automation', problem: 'Manual invoice capture' },
  reason: 'A vendor pitching a product',
};

const calendarDriveProposal = {
  action: 'archive',
  category: 'calendar-drive',
  summary: 'Launch review moved to Tuesday',
  extract: { item: 'Launch review', change: 'Moved to Tuesday 10:00' },
  reason: 'A calendar notification',
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

function extensionFetchRoutingTo(gmailUrl: string, backend: Backend): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === 'https://gmail.googleapis.com') {
      return fetch(new URL(url.pathname + url.search, gmailUrl), init);
    }
    return backend.request(url.pathname + url.search, init);
  };
}

function extensionOptionsFor(gmailUrl: string, backend: Backend) {
  return {
    fetch: extensionFetchRoutingTo(gmailUrl, backend),
    accessToken: 'fake-token',
    accountEmail,
    backendUrl,
  };
}

async function pollScenarioIntoBackend(
  scenario: Parameters<typeof startGmailFakeServer>[0],
  backend: Backend,
  storedHistoryId?: string,
): Promise<string | undefined> {
  const gmail = await startGmailFakeServer(scenario, accountEmail);
  try {
    return await pollGmailOnce({ ...extensionOptionsFor(gmail.url, backend), storedHistoryId });
  } finally {
    await gmail.close();
  }
}

async function runTriageAndReadQueue<Queue>(backend: Backend): Promise<Queue> {
  await backend.request('/triage-run', { method: 'POST' });
  return (await (await backend.request('/triage-queue')).json()) as Queue;
}

async function runTriageAndReadGroupItems(
  backend: Backend,
  category: string,
): Promise<{ messageId: string; extract: Record<string, unknown> }[]> {
  const queue = await runTriageAndReadQueue<{
    groups: { category: string; items: { messageId: string; extract: Record<string, unknown> }[] }[];
  }>(backend);
  return queue.groups.find((group) => group.category === category)?.items ?? [];
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
    const expenseItems = await runTriageAndReadGroupItems(backend, 'expense');

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(expenseItems).toHaveLength(1);
    expect(expenseItems[0]).toMatchObject({
      messageId: messagesSeenByTriage[0]?.id,
      extract: { amount: expenseProposal.extract.amount },
    });
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
  it('polling the sales-pitch scenario shows the pitch with its company in the sales group of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => salesProposal);
    await pollScenarioIntoBackend('sales-pitch', backend);
    const salesItems = await runTriageAndReadGroupItems(backend, 'sales');

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(salesItems).toHaveLength(1);
    expect(salesItems[0]).toMatchObject({
      messageId: messagesSeenByTriage[0]?.id,
      extract: { company: salesProposal.extract.company },
    });
  });
  it('polling the calendar-notification scenario shows the notification with its item in the calendar-drive group of GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => calendarDriveProposal);
    await pollScenarioIntoBackend('calendar-notification', backend);
    const calendarDriveItems = await runTriageAndReadGroupItems(backend, 'calendar-drive');

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(calendarDriveItems).toHaveLength(1);
    expect(calendarDriveItems[0]).toMatchObject({
      messageId: messagesSeenByTriage[0]?.id,
      extract: { item: calendarDriveProposal.extract.item },
    });
  });
  it('polling the history-404 scenario from an expired stored history id reports the whole inbox and returns a fresh history id', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => actionProposal);
    const expiredHistoryId = 'expired-history-id';
    const returnedHistoryId = await pollScenarioIntoBackend('history-404', backend, expiredHistoryId);
    const queue = await runTriageAndReadQueue<{ action: { messageId: string }[] }>(backend);

    expect(returnedHistoryId).toBeDefined();
    expect(returnedHistoryId).not.toBe(expiredHistoryId);
    expect(messagesSeenByTriage).toHaveLength(1);
    expect(queue.action).toEqual([expect.objectContaining({ messageId: messagesSeenByTriage[0]?.id })]);
  });
  it('polling the action-to-me scenario from its current history id gets a 200 history read and reports no messages', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => actionProposal);
    const gmail = await startGmailFakeServer('action-to-me', accountEmail);
    const gmailApi = `${gmail.url}/gmail/v1/users/me`;
    try {
      const { historyId } = (await (await fetch(`${gmailApi}/profile`)).json()) as { historyId: string };
      const historyRead = await fetch(`${gmailApi}/history?startHistoryId=${historyId}`);

      await pollGmailOnce({ ...extensionOptionsFor(gmail.url, backend), storedHistoryId: historyId });
      await backend.request('/triage-run', { method: 'POST' });

      expect(historyRead.status).toBe(200);
      expect(messagesSeenByTriage).toHaveLength(0);
    } finally {
      await gmail.close();
    }
  });
  it('a confirmed archive carried out against the fake leaves the message out of the inbox with the label my-life/archived', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => expenseProposal);
    const gmail = await startGmailFakeServer('expense', accountEmail);
    const gmailApi = `${gmail.url}/gmail/v1/users/me`;
    const extensionOptions = extensionOptionsFor(gmail.url, backend);
    try {
      await pollGmailOnce(extensionOptions);
      await backend.request('/triage-run', { method: 'POST' });
      const messageId = messagesSeenByTriage[0]?.id ?? '';
      await backend.request('/verdicts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, decision: 'confirmed' }),
      });

      await carryOutArchiveCommands(extensionOptions);

      const inbox = (await (await fetch(`${gmailApi}/messages?labelIds=INBOX`)).json()) as {
        messages?: { id: string }[];
      };
      const { labels } = (await (await fetch(`${gmailApi}/labels`)).json()) as {
        labels: { id: string; name: string }[];
      };
      const message = (await (await fetch(`${gmailApi}/messages/${messageId}`)).json()) as { labelIds?: string[] };
      const labelNames = (message.labelIds ?? []).map((labelId) => labels.find(({ id }) => id === labelId)?.name);

      expect(messagesSeenByTriage).toHaveLength(1);
      expect((inbox.messages ?? []).map(({ id }) => id)).not.toContain(messageId);
      expect(labelNames).toContain('my-life/archived');
      expect(labelNames).not.toContain('INBOX');
    } finally {
      await gmail.close();
    }
  });
});
