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
});
