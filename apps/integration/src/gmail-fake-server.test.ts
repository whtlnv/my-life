import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { backfillBodiesOnce } from '@my-life/extension/body-backfill';
import { carryOutMessageCommands } from '@my-life/extension/gmail-archive';
import { carryOutFilterCommands } from '@my-life/extension/gmail-filter';
import { pollGmailOnce } from '@my-life/extension/gmail-poll';

import { extensionFetchRoutingTo } from './extension-fetch.test-support';
import { budgetReviewBody, startGmailFakeServer } from './gmail-fake-server';

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
  body?: string;
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

function extensionOptionsFor(gmailUrl: string, backend: Backend) {
  return {
    fetch: extensionFetchRoutingTo('https://gmail.googleapis.com', gmailUrl, backend),
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

interface ListedDigest {
  category: string;
  key: string;
  count: number;
  severityCounts: Record<string, number>;
}

const senderAddress = (from: string | undefined) => from?.match(/<([^>]+)>/)?.[1] ?? from;

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
  it.each([
    {
      rule: 'polling the expense scenario shows the receipt with its amount in the expense group of GET /triage-queue',
      scenario: 'expense',
      category: 'expense',
      proposal: expenseProposal,
      shownExtract: { amount: expenseProposal.extract.amount },
    },
  ] as const)('$rule', async ({ scenario, category, proposal, shownExtract }) => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => proposal);
    await pollScenarioIntoBackend(scenario, backend);
    const groupItems = await runTriageAndReadGroupItems(backend, category);

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(groupItems).toHaveLength(1);
    expect(groupItems[0]).toMatchObject({
      messageId: messagesSeenByTriage[0]?.id,
      extract: shownExtract,
    });
  });
  it.each([
    { scenario: 'sales-pitch', category: 'sales', proposal: salesProposal },
    { scenario: 'calendar-notification', category: 'calendar-drive', proposal: calendarDriveProposal },
  ] as const)(
    'polling the $scenario scenario puts its one message in a $category digest keyed by its sender address in GET /triage-queue',
    async ({ scenario, category, proposal }) => {
      const { backend, messagesSeenByTriage } = createBackendProposing(() => proposal);
      await pollScenarioIntoBackend(scenario, backend);
      const queue = await runTriageAndReadQueue<{ digests: ListedDigest[] }>(backend);

      expect(messagesSeenByTriage).toHaveLength(1);
      expect(queue.digests).toEqual([
        expect.objectContaining({ category, key: senderAddress(messagesSeenByTriage[0]?.from), count: 1 }),
      ]);
    },
  );
  it('polling the system-update-burst scenario puts its notifications in one system-update digest per sending system in GET /triage-queue', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(systemUpdateProposalFor);
    await pollScenarioIntoBackend('system-update-burst', backend);
    const queue = await runTriageAndReadQueue<{ digests: ListedDigest[] }>(backend);
    const countFrom = (system: string) => messagesSeenByTriage.filter(({ from }) => from?.startsWith(system)).length;

    expect(countFrom('GitHub')).toBe(2);
    expect(countFrom('Sentry')).toBe(1);
    expect(queue.digests.map(({ category, key, count }) => ({ category, key, count }))).toEqual(
      expect.arrayContaining([
        { category: 'system-update', key: 'GitHub', count: 2 },
        { category: 'system-update', key: 'Sentry', count: 1 },
      ]),
    );
    expect(queue.digests).toHaveLength(2);
  });
  it('polling the history-404 scenario from an expired stored history id reports the whole inbox and returns a fresh history id', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => actionProposal);
    const expiredHistoryId = 'expired-history-id';
    const gmail = await startGmailFakeServer('history-404', accountEmail);
    let currentHistoryId: string;
    let returnedHistoryId: string | undefined;
    try {
      ({ historyId: currentHistoryId } = (await (await fetch(`${gmail.url}/gmail/v1/users/me/profile`)).json()) as {
        historyId: string;
      });
      returnedHistoryId = await pollGmailOnce({
        ...extensionOptionsFor(gmail.url, backend),
        storedHistoryId: expiredHistoryId,
      });
    } finally {
      await gmail.close();
    }
    const queue = await runTriageAndReadQueue<{ action: { messageId: string }[] }>(backend);

    expect(returnedHistoryId).toBe(currentHistoryId);
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
  it('backfilling bodies against the action-to-me scenario, for its message reported without a body, leaves GET /bodies-missing empty and the triage request carrying the body', async () => {
    const { backend, messagesSeenByTriage } = createBackendProposing(() => actionProposal);
    await backend.request('/mail-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountEmail,
        historyId: '1',
        messages: [
          {
            id: 'budget-review',
            threadId: 'budget-review',
            from: 'Luis <luis@example.com>',
            to: accountEmail,
            subject: 'Budget review',
            date: 'Mon, 2 Nov 2026 09:00:00 -0600',
            snippet: 'Could you review the budget before Friday?',
          },
        ],
      }),
    });
    const bodiesMissingPath = `/bodies-missing?account=${encodeURIComponent(accountEmail)}`;
    const gmail = await startGmailFakeServer('action-to-me', accountEmail);
    let bodiesMissingBefore: unknown;
    try {
      bodiesMissingBefore = await (await backend.request(bodiesMissingPath)).json();
      await backfillBodiesOnce(extensionOptionsFor(gmail.url, backend));
    } finally {
      await gmail.close();
    }
    const bodiesMissingAfter: unknown = await (await backend.request(bodiesMissingPath)).json();
    await backend.request('/triage-run', { method: 'POST' });

    expect(bodiesMissingBefore).toEqual({ messageIds: ['budget-review'] });
    expect(bodiesMissingAfter).toEqual({ messageIds: [] });
    expect(messagesSeenByTriage).toEqual([expect.objectContaining({ id: 'budget-review', body: budgetReviewBody })]);
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

      await carryOutMessageCommands(extensionOptions);

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
  it('a filter created through users.settings.filters.create is listed by users.settings.filters.list with its id, criteria and action', async () => {
    const gmail = await startGmailFakeServer('expense', accountEmail);
    const gmailApi = `${gmail.url}/gmail/v1/users/me`;
    try {
      const { id: labelId } = (await (
        await fetch(`${gmailApi}/labels`, { method: 'POST', body: JSON.stringify({ name: 'my-life/expense' }) })
      ).json()) as { id: string };
      const filter = {
        criteria: { from: 'recibos@papeleria.example.com' },
        action: { addLabelIds: [labelId], removeLabelIds: ['INBOX'] },
      };

      const created = (await (
        await fetch(`${gmailApi}/settings/filters`, { method: 'POST', body: JSON.stringify(filter) })
      ).json()) as { id: string };
      const { filter: listed } = (await (await fetch(`${gmailApi}/settings/filters`)).json()) as {
        filter?: { id: string }[];
      };

      expect(created.id).toEqual(expect.any(String));
      expect(listed).toEqual([{ id: created.id, ...filter }]);
    } finally {
      await gmail.close();
    }
  });
  it('an approved filter proposal in the backend becomes a filter in the fake Gmail when the extension carries out its create-filter command, and the command is then acknowledged', async () => {
    const backend = createApp({
      allowedEmails: [accountEmail],
      clock: { now: () => triageTime },
      triage: {
        propose: () =>
          Promise.resolve({
            proposal: {
              action: 'archive',
              category: 'sales',
              summary: 'A shop newsletter',
              extract: {},
              reason: 'Promotional mail',
            },
            costInUsd: 0,
            promptVersion: 'triage-v1',
          }),
      },
      filter: {
        propose: () =>
          Promise.resolve({
            proposal: { criteria: { from: 'news@shop.example.com' }, labelName: 'Shop newsletters', skipInbox: true },
            costInUsd: 0,
            promptVersion: 'filter-v1',
          }),
      },
    });
    const postToBackend = (path: string, body: unknown) =>
      backend.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    for (const messageId of ['newsletter-1', 'newsletter-2', 'newsletter-3']) {
      await postToBackend('/mail-report', {
        accountEmail,
        historyId: '1001',
        messages: [
          {
            id: messageId,
            threadId: messageId,
            from: 'Shop <news@shop.example.com>',
            to: accountEmail,
            subject: 'This week at the shop',
            date: 'Mon, 2 Nov 2026 09:00:00 -0600',
            snippet: 'New arrivals',
          },
        ],
      });
      await backend.request('/triage-run', { method: 'POST' });
      await postToBackend('/verdicts', { messageId, decision: 'confirmed' });
    }
    const { proposals } = (await (await backend.request('/filter-proposals')).json()) as {
      proposals: { id: string }[];
    };
    await backend.request(`/filter-proposals/${proposals[0]?.id ?? ''}/approval`, { method: 'POST' });
    const gmail = await startGmailFakeServer('expense', accountEmail);
    const gmailApi = `${gmail.url}/gmail/v1/users/me`;
    try {
      await carryOutFilterCommands(extensionOptionsFor(gmail.url, backend));

      const { filter: filters } = (await (await fetch(`${gmailApi}/settings/filters`)).json()) as {
        filter?: { criteria: unknown; action: { addLabelIds: string[]; removeLabelIds: string[] } }[];
      };
      const { labels } = (await (await fetch(`${gmailApi}/labels`)).json()) as {
        labels: { id: string; name: string }[];
      };
      const { commands } = (await (
        await backend.request(`/commands?accountEmail=${encodeURIComponent(accountEmail)}`)
      ).json()) as { commands: { type?: string }[] };

      expect({
        filters: (filters ?? []).map(({ criteria, action }) => ({
          criteria,
          labelNames: action.addLabelIds.map((labelId) => labels.find(({ id }) => id === labelId)?.name),
          removeLabelIds: action.removeLabelIds,
        })),
        createFilterCommandsLeft: commands.filter(({ type }) => type === 'create-filter'),
      }).toEqual({
        filters: [
          { criteria: { from: 'news@shop.example.com' }, labelNames: ['Shop newsletters'], removeLabelIds: ['INBOX'] },
        ],
        createFilterCommandsLeft: [],
      });
    } finally {
      await gmail.close();
    }
  });
});
