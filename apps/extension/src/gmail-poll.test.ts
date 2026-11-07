import { describe, expect, it } from 'vitest';

import { pollGmailOnce } from './gmail-poll';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

function gmailMessage(id: string, subject: string, date: string) {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ['INBOX'],
    snippet: `Snippet of ${subject}`,
    payload: {
      headers: [
        { name: 'From', value: 'Ana <ana@example.com>' },
        { name: 'To', value: 'francisco@example.com' },
        { name: 'Subject', value: subject },
        { name: 'Date', value: date },
      ],
    },
  };
}

describe('pollGmailOnce', () => {
  it('on its first poll with no stored history id, reports every inbox message, newest first, with the current history id', async () => {
    const messagesById: Record<string, ReturnType<typeof gmailMessage>> = {
      newest: gmailMessage('newest', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600'),
      older: gmailMessage('older', 'Invoice October', 'Wed, 4 Nov 2026 09:00:00 -0600'),
    };
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(
          Response.json({ emailAddress: 'francisco@example.com', messagesTotal: 2, historyId: '98765' }),
        );
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(
          Response.json({
            messages: [
              { id: 'newest', threadId: 'thread-newest' },
              { id: 'older', threadId: 'thread-older' },
            ],
            resultSizeEstimate: 2,
          }),
        );
      }
      const messagePath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname);
      if (url.origin === 'https://gmail.googleapis.com' && messagePath !== null) {
        const message = messagesById[messagePath[1] ?? ''];
        return Promise.resolve(
          message === undefined ? new Response('not found', { status: 404 }) : Response.json(message),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await pollGmailOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/mail-report',
        body: {
          accountEmail: 'francisco@example.com',
          historyId: '98765',
          messages: [
            expect.objectContaining({ id: 'newest', threadId: 'thread-newest', subject: 'Contract review' }),
            expect.objectContaining({ id: 'older', threadId: 'thread-older', subject: 'Invoice October' }),
          ],
        },
      },
    ]);
  });
  it('follows every page of the inbox listing until the last', async () => {
    const messagesById: Record<string, ReturnType<typeof gmailMessage>> = {
      first: gmailMessage('first', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600'),
      second: gmailMessage('second', 'Invoice October', 'Wed, 4 Nov 2026 09:00:00 -0600'),
      third: gmailMessage('third', 'Board agenda', 'Tue, 3 Nov 2026 08:00:00 -0600'),
    };
    const pagesByToken: Record<string, { messages: { id: string; threadId: string }[]; nextPageToken?: string }> = {
      '': { messages: [{ id: 'first', threadId: 'thread-first' }], nextPageToken: 'page-2' },
      'page-2': { messages: [{ id: 'second', threadId: 'thread-second' }], nextPageToken: 'page-3' },
      'page-3': { messages: [{ id: 'third', threadId: 'thread-third' }] },
    };
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        const page = pagesByToken[url.searchParams.get('pageToken') ?? ''];
        return Promise.resolve(
          page === undefined ? new Response('unknown page token', { status: 400 }) : Response.json(page),
        );
      }
      const messagePath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname);
      if (url.origin === 'https://gmail.googleapis.com' && messagePath !== null) {
        const message = messagesById[messagePath[1] ?? ''];
        return Promise.resolve(
          message === undefined ? new Response('not found', { status: 404 }) : Response.json(message),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await pollGmailOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/mail-report',
        body: {
          accountEmail: 'francisco@example.com',
          historyId: '98765',
          messages: [
            expect.objectContaining({ id: 'first' }),
            expect.objectContaining({ id: 'second' }),
            expect.objectContaining({ id: 'third' }),
          ],
        },
      },
    ]);
  });
  it('with a stored history id, reports only the messages added since that id', async () => {
    const messagesById: Record<string, ReturnType<typeof gmailMessage>> = {
      alreadyReported: gmailMessage('alreadyReported', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600'),
      arrivedSince: gmailMessage('arrivedSince', 'Lunch on Friday?', 'Fri, 6 Nov 2026 12:00:00 -0600'),
    };
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/history` && url.searchParams.get('startHistoryId') === '98000') {
        return Promise.resolve(
          Response.json({
            history: [
              {
                id: '98700',
                messages: [{ id: 'arrivedSince', threadId: 'thread-arrivedSince' }],
                messagesAdded: [
                  { message: { id: 'arrivedSince', threadId: 'thread-arrivedSince', labelIds: ['INBOX'] } },
                ],
              },
            ],
            historyId: '98765',
          }),
        );
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(
          Response.json({
            messages: [
              { id: 'arrivedSince', threadId: 'thread-arrivedSince' },
              { id: 'alreadyReported', threadId: 'thread-alreadyReported' },
            ],
          }),
        );
      }
      const messagePath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname);
      if (url.origin === 'https://gmail.googleapis.com' && messagePath !== null) {
        const message = messagesById[messagePath[1] ?? ''];
        return Promise.resolve(
          message === undefined ? new Response('not found', { status: 404 }) : Response.json(message),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await pollGmailOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: '98000',
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/mail-report',
        body: {
          accountEmail: 'francisco@example.com',
          historyId: '98765',
          messages: [
            expect.objectContaining({
              id: 'arrivedSince',
              threadId: 'thread-arrivedSince',
              subject: 'Lunch on Friday?',
            }),
          ],
        },
      },
    ]);
  });
  it('when the history read answers 404, falls back to a full inbox report', async () => {
    const messagesById: Record<string, ReturnType<typeof gmailMessage>> = {
      newest: gmailMessage('newest', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600'),
      older: gmailMessage('older', 'Invoice October', 'Wed, 4 Nov 2026 09:00:00 -0600'),
    };
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/history`) {
        return Promise.resolve(
          Response.json(
            { error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' } },
            { status: 404 },
          ),
        );
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(
          Response.json({
            messages: [
              { id: 'newest', threadId: 'thread-newest' },
              { id: 'older', threadId: 'thread-older' },
            ],
          }),
        );
      }
      const messagePath = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname);
      if (url.origin === 'https://gmail.googleapis.com' && messagePath !== null) {
        const message = messagesById[messagePath[1] ?? ''];
        return Promise.resolve(
          message === undefined ? new Response('not found', { status: 404 }) : Response.json(message),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await pollGmailOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: '12',
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/mail-report',
        body: {
          accountEmail: 'francisco@example.com',
          historyId: '98765',
          messages: [
            expect.objectContaining({ id: 'newest', subject: 'Contract review' }),
            expect.objectContaining({ id: 'older', subject: 'Invoice October' }),
          ],
        },
      },
    ]);
  });
  it('reports each message with its From, To, Cc, Subject, Date and List-Id headers and its snippet, read as metadata', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(Response.json({ messages: [{ id: 'digest', threadId: 'thread-digest' }] }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages/digest`) {
        if (url.searchParams.get('format') !== 'metadata') {
          return Promise.resolve(new Response('only metadata reads are served', { status: 400 }));
        }
        return Promise.resolve(
          Response.json({
            id: 'digest',
            threadId: 'thread-digest',
            labelIds: ['INBOX'],
            snippet: 'This week in the board: agenda and minutes',
            payload: {
              headers: [
                { name: 'From', value: 'Board <board@lists.example.com>' },
                { name: 'To', value: 'team@example.com' },
                { name: 'Cc', value: 'Francisco <francisco@example.com>' },
                { name: 'Subject', value: 'Weekly board digest' },
                { name: 'Date', value: 'Fri, 6 Nov 2026 08:00:00 -0600' },
                { name: 'List-Id', value: 'Board <board.lists.example.com>' },
                { name: 'Received', value: 'from mail.example.com' },
              ],
            },
          }),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await pollGmailOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    expect(backendPosts.map((post) => post.body)).toEqual([
      {
        accountEmail: 'francisco@example.com',
        historyId: '98765',
        messages: [
          {
            id: 'digest',
            threadId: 'thread-digest',
            from: 'Board <board@lists.example.com>',
            to: 'team@example.com',
            cc: 'Francisco <francisco@example.com>',
            subject: 'Weekly board digest',
            date: 'Fri, 6 Nov 2026 08:00:00 -0600',
            snippet: 'This week in the board: agenda and minutes',
            listId: 'Board <board.lists.example.com>',
          },
        ],
      },
    ]);
  });

  it('retries a Gmail read that answers 429 or 5xx, waiting longer before each retry, and reports the message once it is read', async () => {
    const failuresBeforeSuccess = [
      new Response('rate limited', { status: 429 }),
      new Response('backend error', { status: 503 }),
    ];
    const backendPosts: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(Response.json({ messages: [{ id: 'contract', threadId: 'thread-contract' }] }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages/contract`) {
        return Promise.resolve(
          failuresBeforeSuccess.shift() ??
            Response.json(gmailMessage('contract', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600')),
        );
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const waitsInMilliseconds: number[] = [];

    await pollGmailOnce({
      fetch: fakeFetch,
      wait: (milliseconds: number) => {
        waitsInMilliseconds.push(milliseconds);
        return Promise.resolve();
      },
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    expect(waitsInMilliseconds).toHaveLength(2);
    expect(waitsInMilliseconds[0]).toBeGreaterThan(0);
    expect(waitsInMilliseconds[1]).toBeGreaterThan(waitsInMilliseconds[0] ?? 0);
    expect(backendPosts).toEqual([
      {
        accountEmail: 'francisco@example.com',
        historyId: '98765',
        messages: [expect.objectContaining({ id: 'contract', subject: 'Contract review' })],
      },
    ]);
  });

  it('does not retry a Gmail read that answers 403 and fails the poll without reporting', async () => {
    let messageReads = 0;
    const backendPosts: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(Response.json({ messages: [{ id: 'contract', threadId: 'thread-contract' }] }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages/contract`) {
        messageReads++;
        return Promise.resolve(
          Response.json({ error: { code: 403, message: 'Insufficient Permission' } }, { status: 403 }),
        );
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const waitsInMilliseconds: number[] = [];

    const poll = pollGmailOnce({
      fetch: fakeFetch,
      wait: (milliseconds: number) => {
        waitsInMilliseconds.push(milliseconds);
        return Promise.resolve();
      },
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    await expect(poll).rejects.toThrow(/403/);
    expect(messageReads).toBe(1);
    expect(waitsInMilliseconds).toEqual([]);
    expect(backendPosts).toEqual([]);
  });

  it('gives up on a Gmail read that keeps answering 5xx after 5 tries and fails the poll without reporting', async () => {
    const readsBeforeTheFakeRecovers = 20;
    let messageReads = 0;
    const backendPosts: unknown[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin + url.pathname === `${gmailApi}/profile`) {
        return Promise.resolve(Response.json({ emailAddress: 'francisco@example.com', historyId: '98765' }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages` && url.searchParams.get('labelIds') === 'INBOX') {
        return Promise.resolve(Response.json({ messages: [{ id: 'contract', threadId: 'thread-contract' }] }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages/contract`) {
        messageReads++;
        if (messageReads > readsBeforeTheFakeRecovers) {
          return Promise.resolve(
            Response.json(gmailMessage('contract', 'Contract review', 'Thu, 5 Nov 2026 10:00:00 -0600')),
          );
        }
        return Promise.resolve(
          Response.json({ error: { code: 503, message: 'Service Unavailable' } }, { status: 503 }),
        );
      }
      if (url.href === 'http://127.0.0.1:7777/mail-report' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    const poll = pollGmailOnce({
      fetch: fakeFetch,
      wait: () => Promise.resolve(),
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      storedHistoryId: undefined,
    });

    await expect(poll).rejects.toThrow(/503/);
    expect(messageReads).toBe(5);
    expect(backendPosts).toEqual([]);
  });
});
