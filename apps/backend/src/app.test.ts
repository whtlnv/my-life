import { describe, expect, it } from 'vitest';

import { healthResponse } from '@my-life/contracts';

import { createApp } from './app';

describe('backend app', () => {
  it('answers GET /health with the healthy answer', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);
    expect(healthResponse.parse(await response.json())).toEqual({ ok: true });
  });

  it('accepts a registration from an email in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await app.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'ana@example.com' });
  });

  it('refuses a registration from an email not in the allow-list', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });

    const response = await app.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stranger@example.com' }),
    });

    expect(response.status).toBe(403);
  });

  it('answers success to a calendar snapshot from an allow-listed account and shows its events in GET /now', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => new Date('2026-11-02T15:10:00.000Z') },
    });
    const weeklySync = {
      id: 'event-1',
      iCalUID: 'event-1@google.com',
      title: 'Weekly sync',
      start: '2026-11-02T15:00:00.000Z',
      end: '2026-11-02T15:30:00.000Z',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
    };

    const posted = await app.request('/calendar-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountEmail: 'ana@example.com', events: [weeklySync] }),
    });
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
      clock: { now: () => new Date('2026-11-02T15:10:00.000Z') },
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

    const posted = await app.request('/calendar-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountEmail: 'stranger@example.com', events: [intruderMeeting] }),
    });
    const now = await app.request('/now');

    expect(posted.status).toBe(403);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('refuses a calendar snapshot that fails the shared contract with a client error', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: { now: () => new Date('2026-11-02T15:10:00.000Z') },
    });
    const meetingWithoutStart = {
      id: 'event-3',
      iCalUID: 'event-3@google.com',
      title: 'Meeting without start',
      end: '2026-11-02T15:30:00.000Z',
      attendees: [],
    };

    const posted = await app.request('/calendar-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountEmail: 'ana@example.com', events: [meetingWithoutStart] }),
    });
    const now = await app.request('/now');

    expect(posted.status).toBe(400);
    expect(await now.json()).toMatchObject({ current: [] });
  });

  it('merges the snapshots of two accounts in GET /now, showing a cross-account duplicate once', async () => {
    const app = createApp({
      allowedEmails: ['ana@example.com', 'bob@example.com'],
      clock: { now: () => new Date('2026-11-02T15:10:00.000Z') },
    });
    const weeklySync = {
      id: 'event-1',
      iCalUID: 'event-1@google.com',
      title: 'Weekly sync',
      start: '2026-11-02T15:00:00.000Z',
      end: '2026-11-02T15:30:00.000Z',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      attendees: [{ email: 'luis@example.com', displayName: 'Luis' }],
    };
    const dentist = {
      id: 'event-2',
      iCalUID: 'event-2@google.com',
      title: 'Dentist',
      start: '2026-11-02T15:05:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      attendees: [],
    };
    const post = (accountEmail: string, events: unknown[]) =>
      app.request('/calendar-snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountEmail, events }),
      });

    await post('ana@example.com', [weeklySync]);
    await post('bob@example.com', [{ ...weeklySync, id: 'event-1-as-seen-by-bob' }, dentist]);
    const now = await app.request('/now');

    const { current } = (await now.json()) as { current: { iCalUID: string; accounts: string[] }[] };
    expect(current).toHaveLength(2);
    expect(current.map(({ iCalUID, accounts }) => ({ iCalUID, accounts }))).toEqual([
      { iCalUID: weeklySync.iCalUID, accounts: ['ana@example.com', 'bob@example.com'] },
      { iCalUID: dentist.iCalUID, accounts: ['bob@example.com'] },
    ]);
  });
});
