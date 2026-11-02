import { describe, expect, it } from 'vitest';

import { startExtension } from './extension-start';

const calendarApi = 'https://www.googleapis.com/calendar/v3';

describe('startExtension', () => {
  it('registers with the backend using the profile account email, then posts the first snapshot', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({ kind: 'calendar#calendarList', items: [] });
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: async () => 'francisco@example.com',
      accessToken: async () => 'token-for-francisco',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(backendPosts).toEqual([
      { path: '/register', body: { email: 'francisco@example.com' } },
      { path: '/calendar-snapshot', body: { accountEmail: 'francisco@example.com', events: [] } },
    ]);
  });
});
