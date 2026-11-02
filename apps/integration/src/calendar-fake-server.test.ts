import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { pollCalendarOnce } from '@my-life/extension/calendar-poll';

import { startCalendarFakeServer } from './calendar-fake-server';

const accountEmail = 'ana@example.com';
const backendUrl = 'http://backend.test';
const pollTime = new Date('2026-11-02T15:10:00.000Z');

interface PostedSnapshot {
  accountEmail: string;
  events: { iCalUID: string; allDay?: boolean }[];
}

async function pollScenario(scenario: Parameters<typeof startCalendarFakeServer>[0]) {
  const calendar = await startCalendarFakeServer(scenario);
  try {
    return await pollThroughFakes(calendar.url);
  } finally {
    await calendar.close();
  }
}

async function pollThroughFakes(calendarUrl: string) {
  const backend = createApp({ allowedEmails: [accountEmail], clock: { now: () => pollTime } });
  const postedSnapshots: PostedSnapshot[] = [];
  const fetchThroughFakes = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === 'https://www.googleapis.com') {
      return fetch(new URL(url.pathname + url.search, calendarUrl), init);
    }
    postedSnapshots.push(JSON.parse(String(init?.body)) as PostedSnapshot);
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
  return { backend, postedSnapshots };
}

describe('Calendar fake server', () => {
  it('polling the empty scenario yields a snapshot with no events and GET /now shows nothing current or next', async () => {
    const { backend, postedSnapshots } = await pollScenario('empty');
    const nowView = (await (await backend.request('/now')).json()) as Record<string, unknown>;

    expect(postedSnapshots).toEqual([{ accountEmail, events: [] }]);
    expect(nowView).toMatchObject({ current: [], next: [] });
  });

  it('polling the overlapping scenario yields two events that GET /now reports as both current', async () => {
    const { backend, postedSnapshots } = await pollScenario('overlapping');
    const nowView = (await (await backend.request('/now')).json()) as {
      current: { iCalUID: string; start: string; end: string }[];
    };

    const postedIdentifiers = postedSnapshots.flatMap((snapshot) => snapshot.events.map((event) => event.iCalUID));
    expect(postedIdentifiers).toHaveLength(2);
    expect(nowView.current.map((event) => event.iCalUID).sort()).toEqual([...postedIdentifiers].sort());
    for (const event of nowView.current) {
      expect(event.start <= pollTime.toISOString() && pollTime.toISOString() < event.end).toBe(true);
    }
  });

  it('polling the all-day scenario yields an event GET /now lists in later today and not as current', async () => {
    const { backend, postedSnapshots } = await pollScenario('all-day');
    const nowView = (await (await backend.request('/now')).json()) as {
      current: { iCalUID: string }[];
      laterToday: { iCalUID: string }[];
    };

    const postedAllDayIdentifiers = postedSnapshots.flatMap((snapshot) =>
      snapshot.events.filter((event) => event.allDay === true).map((event) => event.iCalUID),
    );
    expect(postedAllDayIdentifiers).toHaveLength(1);
    expect(nowView.laterToday.map((event) => event.iCalUID)).toEqual(postedAllDayIdentifiers);
    expect(nowView.current).toEqual([]);
  });
});
