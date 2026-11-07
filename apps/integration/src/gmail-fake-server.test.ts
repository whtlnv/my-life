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

describe('Gmail fake server', () => {
  it('polling the action-to-me scenario puts the message, addressed to the user, in the action block of GET /triage-queue', async () => {
    const messagesSeenByTriage: { id: string; to?: string }[] = [];
    const backend = createApp({
      allowedEmails: [accountEmail],
      clock: { now: () => triageTime },
      triage: {
        propose: (message) => {
          messagesSeenByTriage.push(message);
          return Promise.resolve({ proposal: actionProposal, costInUsd: 0, promptVersion: 'triage-v1' });
        },
      },
    });
    const gmail = await startGmailFakeServer('action-to-me', accountEmail);
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
    await backend.request('/triage-run', { method: 'POST' });
    const queue = (await (await backend.request('/triage-queue')).json()) as {
      action: { messageId: string; category: string; accountEmail: string }[];
    };

    expect(messagesSeenByTriage).toHaveLength(1);
    expect(messagesSeenByTriage[0]?.to).toContain(accountEmail);
    expect(queue.action).toEqual([
      expect.objectContaining({ messageId: messagesSeenByTriage[0]?.id, category: 'action', accountEmail }),
    ]);
  });
  it('polling the cc-thread scenario shows its two messages as one line, the newest, in the cc-thread group of GET /triage-queue', async () => {
    const messagesSeenByTriage: { id: string; threadId?: string; date?: string }[] = [];
    const backend = createApp({
      allowedEmails: [accountEmail],
      clock: { now: () => triageTime },
      triage: {
        propose: (message) => {
          messagesSeenByTriage.push(message);
          return Promise.resolve({ proposal: ccThreadProposal, costInUsd: 0, promptVersion: 'triage-v1' });
        },
      },
    });
    const gmail = await startGmailFakeServer('cc-thread', accountEmail);
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
    await backend.request('/triage-run', { method: 'POST' });
    const queue = (await (await backend.request('/triage-queue')).json()) as {
      groups: { category: string; count: number; items: { messageId: string }[] }[];
    };
    const [newest, older] = [...messagesSeenByTriage].sort(
      (first, second) => Date.parse(second.date ?? '') - Date.parse(first.date ?? ''),
    );

    expect(messagesSeenByTriage).toHaveLength(2);
    expect(newest?.threadId).toBe(older?.threadId);
    expect(queue.groups.find(({ category }) => category === 'cc-thread')).toEqual(
      expect.objectContaining({ count: 1, items: [expect.objectContaining({ messageId: newest?.id })] }),
    );
  });
});
