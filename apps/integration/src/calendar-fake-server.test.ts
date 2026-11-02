import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { pollCalendarOnce } from '@my-life/extension/calendar-poll';

import { startCalendarFakeServer } from './calendar-fake-server';

const accountEmail = 'ana@example.com';
const backendUrl = 'http://backend.test';
const pollTime = new Date('2026-11-02T15:10:00.000Z');

describe('Calendar fake server', () => {
  it('polling the empty scenario yields a snapshot with no events and GET /now shows nothing current or next', async () => {
    const calendar = await startCalendarFakeServer('empty');
    try {
      const backend = createApp({ allowedEmails: [accountEmail], clock: { now: () => pollTime } });
      const postedSnapshots: unknown[] = [];
      const fetchThroughFakes = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.origin === 'https://www.googleapis.com') {
          return fetch(new URL(url.pathname + url.search, calendar.url), init);
        }
        postedSnapshots.push(JSON.parse(String(init?.body)));
        return backend.request(url.pathname, init);
      };

      await pollCalendarOnce({
        fetch: fetchThroughFakes,
        accessToken: 'fake-token',
        accountEmail,
        backendUrl,
        now: pollTime,
        timeZone: 'America/Mexico_City',
      });
      const nowView = (await (await backend.request('/now')).json()) as Record<string, unknown>;

      expect(postedSnapshots).toEqual([{ accountEmail, events: [] }]);
      expect(nowView).toMatchObject({ current: [], next: [] });
    } finally {
      await calendar.close();
    }
  });
});
