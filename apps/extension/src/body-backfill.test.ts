import { describe, expect, it } from 'vitest';

import { backfillBodiesOnce } from './body-backfill';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';

describe('backfillBodiesOnce', () => {
  it('reads each message the backend lists as missing a body in full and reports its trimmed body', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (
        url.origin + url.pathname === 'http://127.0.0.1:7777/bodies-missing' &&
        url.searchParams.get('account') === 'francisco@example.com'
      ) {
        return Promise.resolve(Response.json({ messageIds: ['older'] }));
      }
      if (url.origin + url.pathname === `${gmailApi}/messages/older`) {
        if (url.searchParams.get('format') !== 'full') {
          return Promise.resolve(new Response('only full reads are served', { status: 400 }));
        }
        return Promise.resolve(
          Response.json({
            id: 'older',
            threadId: 'thread-older',
            labelIds: ['INBOX'],
            snippet: 'Agenda attached.',
            payload: {
              headers: [
                { name: 'From', value: 'Board <board@lists.example.com>' },
                { name: 'To', value: 'francisco@example.com' },
                { name: 'Subject', value: 'Weekly board digest' },
                { name: 'Date', value: 'Fri, 6 Nov 2026 08:00:00 -0600' },
              ],
              mimeType: 'text/plain',
              body: {
                size: 54,
                data: Buffer.from('Agenda attached.\n\nOn Thu, Board wrote:\n> last week\n').toString('base64url'),
              },
            },
          }),
        );
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await backfillBodiesOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    expect(backendPosts).toEqual([
      {
        path: '/bodies-report',
        body: {
          accountEmail: 'francisco@example.com',
          bodies: [{ messageId: 'older', body: 'Agenda attached.\n' }],
        },
      },
    ]);
  });
});
