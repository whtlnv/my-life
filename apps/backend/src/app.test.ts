import { describe, expect, it } from 'vitest';

import { healthResponse } from '@my-life/contracts';

import { createApp } from './app';

type App = ReturnType<typeof createApp>;

const postJson = (app: App, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const postCalendarSnapshot = (app: App, accountEmail: string, events: unknown[]) =>
  postJson(app, '/calendar-snapshot', { accountEmail, events });

const postRegistration = (app: App, email: string) => postJson(app, '/register', { email });

const clockAtTenPastThree = { now: () => new Date('2026-11-02T15:10:00.000Z') };

const weeklySync = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  start: '2026-11-02T15:00:00.000Z',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
};

describe('backend app', () => {
  it('answers GET /health with the healthy answer', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);
    expect(healthResponse.parse(await response.json())).toEqual({ ok: true });
  });

  it('accepts a registration from an email in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await postRegistration(app, 'ana@example.com');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'ana@example.com' });
  });

  it('refuses a registration from an email not in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await postRegistration(app, 'stranger@example.com');

    expect(response.status).toBe(403);
  });

  it('answers success to a calendar snapshot from an allow-listed account and shows its events in GET /now', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });

    const posted = await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    const now = await app.request('/now');

    expect(posted.status).toBe(200);
    expect(now.status).toBe(200);
    expect(await now.json()).toMatchObject({
      current: [{ ...weeklySync, accounts: ['ana@example.com'] }],
    });
  });

  it('refuses a calendar snapshot from an account outside the allow-list and shows none of its events in GET /now', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const intruderMeeting = {
      id: 'event-9',
      iCalUID: 'event-9@google.com',
      title: 'Intruder meeting',
      start: '2026-11-02T15:00:00.000Z',
      end: '2026-11-02T15:30:00.000Z',
      meetLink: null,
      attendees: [],
    };

    const posted = await postCalendarSnapshot(app, 'stranger@example.com', [intruderMeeting]);
    const now = await app.request('/now');

    expect(posted.status).toBe(403);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('refuses a calendar snapshot that fails the shared contract with a client error', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const meetingWithoutStart = {
      id: 'event-3',
      iCalUID: 'event-3@google.com',
      title: 'Meeting without start',
      end: '2026-11-02T15:30:00.000Z',
      attendees: [],
    };

    const posted = await postCalendarSnapshot(app, 'ana@example.com', [meetingWithoutStart]);
    const now = await app.request('/now');

    expect(posted.status).toBe(400);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('merges the snapshots of two accounts in GET /now, showing a cross-account duplicate once', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bob@example.com'],
      clock: clockAtTenPastThree,
    });
    const dentist = {
      id: 'event-2',
      iCalUID: 'event-2@google.com',
      title: 'Dentist',
      start: '2026-11-02T15:05:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(app, 'bob@example.com', [{ ...weeklySync, id: 'event-1-as-seen-by-bob' }, dentist]);
    const now = await app.request('/now');

    const { current } = (await now.json()) as { current: { iCalUID: string; accounts: string[] }[] };
    expect(current).toHaveLength(2);
    expect(current.map(({ iCalUID, accounts }) => ({ iCalUID, accounts }))).toEqual([
      { iCalUID: weeklySync.iCalUID, accounts: ['ana@example.com', 'bob@example.com'] },
      { iCalUID: dentist.iCalUID, accounts: ['bob@example.com'] },
    ]);
  });

  it('replaces an account\'s events with its newer snapshot in GET /now, dropping an event missing from it', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const standUp = {
      id: 'event-4',
      iCalUID: 'event-4@google.com',
      title: 'Stand-up',
      start: '2026-11-02T15:05:00.000Z',
      end: '2026-11-02T15:45:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(app, 'ana@example.com', [standUp]);
    const now = await app.request('/now');

    const { current } = (await now.json()) as { current: { iCalUID: string }[] };
    expect(current.map(({ iCalUID }) => iCalUID)).toEqual([standUp.iCalUID]);
  });

  it('reports in GET /now when each account last reported and whether it is stale', async () => {
    let currentTime = new Date('2026-11-02T15:00:00.000Z');
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bob@example.com'],
      clock: { now: () => currentTime },
    });

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync]);
    currentTime = new Date('2026-11-02T15:10:00.000Z');
    await postCalendarSnapshot(app, 'bob@example.com', [weeklySync]);
    currentTime = new Date('2026-11-02T15:12:00.000Z');
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({
      accounts: [
        { email: 'ana@example.com', lastReportedAt: '2026-11-02T15:00:00.000Z', stale: true },
        { email: 'bob@example.com', lastReportedAt: '2026-11-02T15:10:00.000Z', stale: false },
      ],
    });
  });

  it('includes in GET /now the badge count of events starting within 15 minutes', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
    });
    const startingSoon = {
      id: 'event-5',
      iCalUID: 'event-5@google.com',
      title: 'Starting soon',
      start: '2026-11-02T15:20:00.000Z',
      end: '2026-11-02T15:50:00.000Z',
      attendees: [],
    };
    const startingLater = {
      id: 'event-6',
      iCalUID: 'event-6@google.com',
      title: 'Starting later',
      start: '2026-11-02T15:40:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(app, 'ana@example.com', [weeklySync, startingSoon, startingLater]);
    const now = await app.request('/now');

    expect(await now.json()).toMatchObject({ badgeCount: 1 });
  });

  it('makes the GET /now badge count zero when no event starts within 15 minutes and two when two do', async () => {
    const quietApp = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const busyApp = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const startingAtQuarterPast = {
      id: 'event-7',
      iCalUID: 'event-7@google.com',
      title: 'Starting at quarter past',
      start: '2026-11-02T15:15:00.000Z',
      end: '2026-11-02T15:45:00.000Z',
      attendees: [],
    };
    const startingAtTwentyPast = {
      id: 'event-8',
      iCalUID: 'event-8@google.com',
      title: 'Starting at twenty past',
      start: '2026-11-02T15:20:00.000Z',
      end: '2026-11-02T15:50:00.000Z',
      attendees: [],
    };

    await postCalendarSnapshot(quietApp, 'ana@example.com', [weeklySync]);
    await postCalendarSnapshot(busyApp, 'ana@example.com', [
      weeklySync,
      startingAtQuarterPast,
      startingAtTwentyPast,
    ]);

    expect(await (await quietApp.request('/now')).json()).toMatchObject({ badgeCount: 0 });
    expect(await (await busyApp.request('/now')).json()).toMatchObject({ badgeCount: 2 });
  });

  it('bounds later today in GET /now by midnight in America/Mexico_City, not the machine\'s time zone', async () => {
    const machineTimeZone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      // 04:00Z on Nov 3 is 22:00 on Nov 2 in Mexico City, but already Nov 3 on a UTC machine.
      const app = createApp({
        allowedEmails: ['ana@example.com'],
        clock: { now: () => new Date('2026-11-03T04:00:00.000Z') },
      });
      const lateCall = {
        id: 'event-10',
        iCalUID: 'event-10@google.com',
        title: 'Late call',
        start: '2026-11-03T05:00:00.000Z',
        end: '2026-11-03T05:30:00.000Z',
        attendees: [],
      };
      const afterMidnightStandup = {
        id: 'event-11',
        iCalUID: 'event-11@google.com',
        title: 'After-midnight standup',
        start: '2026-11-03T06:30:00.000Z',
        end: '2026-11-03T07:00:00.000Z',
        attendees: [],
      };

      await postCalendarSnapshot(app, 'ana@example.com', [lateCall, afterMidnightStandup]);
      const now = await app.request('/now');

      const { laterToday } = (await now.json()) as { laterToday: { iCalUID: string }[] };
      expect(laterToday.map(({ iCalUID }) => iCalUID)).toEqual([lateCall.iCalUID]);
    } finally {
      if (machineTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = machineTimeZone;
      }
    }
  });
});
