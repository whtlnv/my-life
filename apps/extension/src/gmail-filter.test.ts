import { describe, expect, it } from 'vitest';

import type { FetchFunction } from './fetch-function';
import { carryOutFilterCommands } from './gmail-filter';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';
const backendUrl = 'http://127.0.0.1:7777';

interface RecordedRequest {
  request: string;
  body: unknown;
}

describe('carryOutFilterCommands', () => {
  it('creates the missing label, creates a Gmail filter that labels and skips the inbox, and acknowledges with the Gmail filter id', async () => {
    const recordedRequests: RecordedRequest[] = [];
    const fetch: FetchFunction = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const path = url.origin + url.pathname;
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      if (path === `${backendUrl}/commands` && url.searchParams.get('accountEmail') === 'francisco@example.com') {
        return Promise.resolve(
          Response.json({
            commands: [
              {
                id: 'create-filter-proposal-1',
                type: 'create-filter',
                criteria: { from: 'news@shop.example.com' },
                label: 'my-life/shop',
                skipInbox: true,
              },
            ],
          }),
        );
      }
      if (path === `${gmailApi}/labels` && init?.method === 'POST') {
        recordedRequests.push({ request: 'create label', body });
        return Promise.resolve(Response.json({ id: 'Label_99', name: 'my-life/shop', type: 'user' }));
      }
      if (path === `${gmailApi}/labels`) {
        return Promise.resolve(Response.json({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }] }));
      }
      if (path === `${gmailApi}/settings/filters` && init?.method === 'POST') {
        recordedRequests.push({ request: 'create filter', body });
        return Promise.resolve(Response.json({ id: 'gmail-filter-7', ...(body as object) }));
      }
      if (path === `${backendUrl}/commands/create-filter-proposal-1/acknowledgement` && init?.method === 'POST') {
        recordedRequests.push({ request: 'acknowledge create-filter-proposal-1', body });
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await carryOutFilterCommands({
      fetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl,
    });

    expect(recordedRequests).toEqual([
      { request: 'create label', body: expect.objectContaining({ name: 'my-life/shop' }) as unknown },
      {
        request: 'create filter',
        body: {
          criteria: { from: 'news@shop.example.com' },
          action: { addLabelIds: ['Label_99'], removeLabelIds: ['INBOX'] },
        },
      },
      { request: 'acknowledge create-filter-proposal-1', body: { gmailFilterId: 'gmail-filter-7' } },
    ]);
  });
});
