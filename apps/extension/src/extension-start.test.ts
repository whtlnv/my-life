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

  it('polls again every 5 minutes after the first snapshot and posts each result, and a failed poll does not stop the next one', async () => {
    const backendPosts: { path: string; body: unknown }[] = [];
    let calendarListRequests = 0;
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        calendarListRequests++;
        if (calendarListRequests === 2) {
          return new Response('forbidden', { status: 403 });
        }
        return Response.json({ kind: 'calendar#calendarList', items: [] });
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };
    let scheduledMilliseconds: number | undefined;
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: async () => 'francisco@example.com',
      accessToken: async () => 'token-for-francisco',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (milliseconds: number, poll: () => Promise<void>) => {
        scheduledMilliseconds = milliseconds;
        scheduledPoll = poll;
      },
    });

    expect(scheduledMilliseconds).toBe(5 * 60 * 1000);
    await expect(scheduledPoll?.()).resolves.toBeUndefined();
    await expect(scheduledPoll?.()).resolves.toBeUndefined();
    const snapshot = { path: '/calendar-snapshot', body: { accountEmail: 'francisco@example.com', events: [] } };
    expect(backendPosts).toEqual([{ path: '/register', body: { email: 'francisco@example.com' } }, snapshot, snapshot]);
  });

  it('requests the Calendar window for the moment of each scheduled poll, so a poll the next day asks for the next day', async () => {
    const requestedWindows: { timeMin: string | null; timeMax: string | null }[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({ kind: 'calendar#calendarList', items: [{ id: 'primary', summary: 'Francisco' }] });
      }
      if (url.pathname === '/calendar/v3/calendars/primary/events') {
        requestedWindows.push({ timeMin: url.searchParams.get('timeMin'), timeMax: url.searchParams.get('timeMax') });
        return Response.json({ kind: 'calendar#events', items: [] });
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };
    let currentTime = new Date('2026-11-02T10:00:00-06:00');
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: async () => 'francisco@example.com',
      accessToken: async () => 'token-for-francisco',
      backendUrl: 'http://127.0.0.1:7777',
      now: currentTime,
      clock: () => currentTime,
      timeZone: 'America/Mexico_City',
      every: (_milliseconds: number, poll: () => Promise<void>) => {
        scheduledPoll = poll;
      },
    });
    currentTime = new Date('2026-11-03T09:00:00-06:00');
    await scheduledPoll?.();

    expect(requestedWindows).toEqual([
      { timeMin: '2026-11-02T06:00:00.000Z', timeMax: '2026-11-04T06:00:00.000Z' },
      { timeMin: '2026-11-03T06:00:00.000Z', timeMax: '2026-11-05T06:00:00.000Z' },
    ]);
  });

  it('refreshes the badge from GET /now after the first snapshot and after every scheduled poll', async () => {
    const badgeCounts = [1, 3];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({ kind: 'calendar#calendarList', items: [] });
      }
      if (url.href === 'http://127.0.0.1:7777/now' && init?.method !== 'POST') {
        return Response.json({ badgeCount: badgeCounts.shift() });
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };
    const badgeTexts: string[] = [];
    let scheduledPoll: (() => Promise<void>) | undefined;

    await startExtension({
      fetch: fakeFetch,
      profileAccountEmail: async () => 'francisco@example.com',
      accessToken: async () => 'token-for-francisco',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
      every: (_milliseconds: number, poll: () => Promise<void>) => {
        scheduledPoll = poll;
      },
      setBadgeText: async (text: string) => {
        badgeTexts.push(text);
      },
    });
    const badgeTextsAfterStart = [...badgeTexts];
    await scheduledPoll?.();

    expect(badgeTextsAfterStart).toEqual(['1']);
    expect(badgeTexts).toEqual(['1', '3']);
  });
});
