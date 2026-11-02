import { describe, expect, it } from 'vitest';

import { refreshBadge } from './badge-refresh';

describe('refreshBadge', () => {
  it('shows the badge count returned by GET /now, and an empty badge when the count is zero', async () => {
    const badgeCounts = [2, 0];
    const fakeFetch = (input: string | URL | Request): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === 'http://127.0.0.1:7777/now') {
        return Promise.resolve(Response.json({ badgeCount: badgeCounts.shift() }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };
    const badgeTexts: string[] = [];
    const setBadgeText = (text: string) => {
      badgeTexts.push(text);
      return Promise.resolve();
    };

    await refreshBadge({ fetch: fakeFetch, backendUrl: 'http://127.0.0.1:7777', setBadgeText });
    await refreshBadge({ fetch: fakeFetch, backendUrl: 'http://127.0.0.1:7777', setBadgeText });

    expect(badgeTexts).toEqual(['2', '']);
  });
});
