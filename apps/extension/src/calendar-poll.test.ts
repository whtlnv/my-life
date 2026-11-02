import { describe, expect, it } from 'vitest';

import { pollCalendarOnce } from './calendar-poll';

const calendarApi = 'https://www.googleapis.com/calendar/v3';

function calendarEvent(id: string, summary: string, start: string, end: string) {
  return {
    kind: 'calendar#event',
    id,
    iCalUID: `${id}@google.com`,
    status: 'confirmed',
    summary,
    start: { dateTime: start, timeZone: 'America/Mexico_City' },
    end: { dateTime: end, timeZone: 'America/Mexico_City' },
  };
}

describe('pollCalendarOnce', () => {
  it('fetches the calendar list, then each polled calendar\'s events in the time window, and posts one snapshot of all of them to the backend', async () => {
    const eventsByCalendarId: Record<string, unknown[]> = {
      'francisco@example.com': [
        calendarEvent('standup', 'Standup', '2026-11-02T09:00:00-06:00', '2026-11-02T09:15:00-06:00'),
      ],
      'team@group.calendar.google.com': [
        calendarEvent('planning', 'Planning', '2026-11-03T11:00:00-06:00', '2026-11-03T12:00:00-06:00'),
      ],
    };
    const eventsRequests: URL[] = [];
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({
          kind: 'calendar#calendarList',
          items: [
            { kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true },
            { kind: 'calendar#calendarListEntry', id: 'team@group.calendar.google.com', summary: 'Team' },
            { kind: 'calendar#calendarListEntry', id: 'en.mexican#holiday@group.v.calendar.google.com', summary: 'Holidays' },
          ],
        });
      }
      const eventsPath = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/.exec(url.pathname);
      if (url.origin === 'https://www.googleapis.com' && eventsPath !== null) {
        eventsRequests.push(url);
        return Response.json({ kind: 'calendar#events', items: eventsByCalendarId[decodeURIComponent(eventsPath[1] ?? '')] ?? [] });
      }
      if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(String(init.body)) });
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };

    await pollCalendarOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(eventsRequests.map((url) => decodeURIComponent(url.pathname))).toEqual([
      '/calendar/v3/calendars/francisco@example.com/events',
      '/calendar/v3/calendars/team@group.calendar.google.com/events',
    ]);
    for (const url of eventsRequests) {
      expect(new Date(url.searchParams.get('timeMin') ?? '').getTime()).toBe(new Date('2026-11-02T00:00:00-06:00').getTime());
      expect(new Date(url.searchParams.get('timeMax') ?? '').getTime()).toBe(new Date('2026-11-04T00:00:00-06:00').getTime());
    }
    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/calendar-snapshot',
        body: {
          accountEmail: 'francisco@example.com',
          events: [
            {
              id: 'standup',
              iCalUID: 'standup@google.com',
              title: 'Standup',
              start: '2026-11-02T15:00:00.000Z',
              end: '2026-11-02T15:15:00.000Z',
              attendees: [],
            },
            {
              id: 'planning',
              iCalUID: 'planning@google.com',
              title: 'Planning',
              start: '2026-11-03T17:00:00.000Z',
              end: '2026-11-03T18:00:00.000Z',
              attendees: [],
            },
          ],
        },
      },
    ]);
  });

  it('asks Calendar to expand recurring events into single instances ordered by start time, so a weekly meeting shows on today\'s date', async () => {
    const weeklySyncSeries = {
      ...calendarEvent('weekly-sync', 'Weekly sync', '2026-10-26T12:00:00-06:00', '2026-10-26T12:30:00-06:00'),
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    };
    const todaysWeeklySyncInstance = {
      ...calendarEvent('weekly-sync_20261102T180000Z', 'Weekly sync', '2026-11-02T12:00:00-06:00', '2026-11-02T12:30:00-06:00'),
      iCalUID: 'weekly-sync@google.com',
      recurringEventId: 'weekly-sync',
    };
    const backendPosts: unknown[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({
          kind: 'calendar#calendarList',
          items: [{ kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true }],
        });
      }
      if (url.pathname === '/calendar/v3/calendars/francisco%40example.com/events') {
        const expandsRecurringEvents =
          url.searchParams.get('singleEvents') === 'true' && url.searchParams.get('orderBy') === 'startTime';
        return Response.json({
          kind: 'calendar#events',
          items: [expandsRecurringEvents ? todaysWeeklySyncInstance : weeklySyncSeries],
        });
      }
      if (url.href === 'http://127.0.0.1:7777/calendar-snapshot' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };

    await pollCalendarOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(backendPosts).toEqual([
      {
        accountEmail: 'francisco@example.com',
        events: [
          {
            id: 'weekly-sync_20261102T180000Z',
            iCalUID: 'weekly-sync@google.com',
            title: 'Weekly sync',
            start: '2026-11-02T18:00:00.000Z',
            end: '2026-11-02T18:30:00.000Z',
            attendees: [],
          },
        ],
      },
    ]);
  });

  it('retries a 429 or 5xx answer from Calendar with growing waits and posts the snapshot once Calendar succeeds', async () => {
    const failuresBeforeSuccess = [
      Response.json({ error: { code: 429, message: 'Rate Limit Exceeded' } }, { status: 429 }),
      Response.json({ error: { code: 503, message: 'Backend Error' } }, { status: 503 }),
    ];
    const backendPosts: unknown[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({
          kind: 'calendar#calendarList',
          items: [{ kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true }],
        });
      }
      if (url.pathname === '/calendar/v3/calendars/francisco%40example.com/events') {
        return (
          failuresBeforeSuccess.shift() ??
          Response.json({
            kind: 'calendar#events',
            items: [calendarEvent('standup', 'Standup', '2026-11-02T09:00:00-06:00', '2026-11-02T09:15:00-06:00')],
          })
        );
      }
      if (url.href === 'http://127.0.0.1:7777/calendar-snapshot' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };
    const waitsInMilliseconds: number[] = [];

    await pollCalendarOnce({
      fetch: fakeFetch,
      wait: async (milliseconds: number) => {
        waitsInMilliseconds.push(milliseconds);
      },
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      now: new Date('2026-11-02T10:00:00-06:00'),
      timeZone: 'America/Mexico_City',
    });

    expect(waitsInMilliseconds).toHaveLength(2);
    expect(waitsInMilliseconds[0]).toBeGreaterThan(0);
    expect(waitsInMilliseconds[1]).toBeGreaterThan(waitsInMilliseconds[0] ?? 0);
    expect(backendPosts).toEqual([
      {
        accountEmail: 'francisco@example.com',
        events: [
          {
            id: 'standup',
            iCalUID: 'standup@google.com',
            title: 'Standup',
            start: '2026-11-02T15:00:00.000Z',
            end: '2026-11-02T15:15:00.000Z',
            attendees: [],
          },
        ],
      },
    ]);
  });

  it('does not retry a 4xx answer other than 429 from Calendar and reports it as an error without posting a snapshot', async () => {
    let eventsRequestCount = 0;
    const backendPosts: unknown[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({
          kind: 'calendar#calendarList',
          items: [{ kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true }],
        });
      }
      if (url.pathname === '/calendar/v3/calendars/francisco%40example.com/events') {
        eventsRequestCount++;
        return Response.json({ error: { code: 403, message: 'Forbidden' } }, { status: 403 });
      }
      if (url.href === 'http://127.0.0.1:7777/calendar-snapshot' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };

    await expect(
      pollCalendarOnce({
        fetch: fakeFetch,
        wait: async () => {},
        accessToken: 'token-for-francisco',
        accountEmail: 'francisco@example.com',
        backendUrl: 'http://127.0.0.1:7777',
        now: new Date('2026-11-02T10:00:00-06:00'),
        timeZone: 'America/Mexico_City',
      }),
    ).rejects.toThrow(/403/);
    expect(eventsRequestCount).toBe(1);
    expect(backendPosts).toEqual([]);
  });
  it('gives up after five retryable answers in a row from Calendar and reports an error instead of retrying forever', async () => {
    const retryableAnswersBeforeCalendarRecovers = 50;
    let eventsRequestCount = 0;
    const backendPosts: unknown[] = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href === `${calendarApi}/users/me/calendarList`) {
        return Response.json({
          kind: 'calendar#calendarList',
          items: [{ kind: 'calendar#calendarListEntry', id: 'francisco@example.com', summary: 'Francisco', primary: true }],
        });
      }
      if (url.pathname === '/calendar/v3/calendars/francisco%40example.com/events') {
        eventsRequestCount++;
        if (eventsRequestCount <= retryableAnswersBeforeCalendarRecovers) {
          return Response.json({ error: { code: 503, message: 'Backend Error' } }, { status: 503 });
        }
        return Response.json({ kind: 'calendar#events', items: [] });
      }
      if (url.href === 'http://127.0.0.1:7777/calendar-snapshot' && init?.method === 'POST') {
        backendPosts.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return new Response('unexpected request', { status: 404 });
    };

    await expect(
      pollCalendarOnce({
        fetch: fakeFetch,
        wait: async () => {},
        accessToken: 'token-for-francisco',
        accountEmail: 'francisco@example.com',
        backendUrl: 'http://127.0.0.1:7777',
        now: new Date('2026-11-02T10:00:00-06:00'),
        timeZone: 'America/Mexico_City',
      }),
    ).rejects.toThrow(/503/);
    expect(eventsRequestCount).toBe(5);
    expect(backendPosts).toEqual([]);
  });
});
