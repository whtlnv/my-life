import { describe, expect, it } from 'vitest';

import { calendarSnapshot } from './calendar-snapshot';

const weeklySyncWithoutStart = {
  id: 'event-1',
  iCalUID: 'event-1@google.com',
  title: 'Weekly sync',
  end: '2026-11-02T15:30:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'ana@example.com', displayName: 'Ana' }],
};
const weeklySync = { ...weeklySyncWithoutStart, start: '2026-11-02T15:00:00.000Z' };
const snapshotOf = (event: object) => ({ accountEmail: 'francisco@example.com', events: [event] });

describe('calendarSnapshot', () => {
  it('accepts a snapshot with the account email and a full event', () => {
    const snapshot = snapshotOf(weeklySync);

    expect(calendarSnapshot.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects a snapshot whose event has no start', () => {
    const snapshot = snapshotOf(weeklySyncWithoutStart);

    expect(calendarSnapshot.safeParse(snapshot).success).toBe(false);
  });

  it('accepts an all-day event given as a date without a time', () => {
    const offsite = {
      id: 'event-2',
      iCalUID: 'event-2@google.com',
      title: 'Team offsite',
      allDay: true,
      start: '2026-11-03',
      end: '2026-11-04',
      meetLink: 'https://meet.google.com/off-site-xyz',
      attendees: [],
    };
    const snapshot = snapshotOf(offsite);

    expect(calendarSnapshot.parse(snapshot)).toEqual(snapshot);
  });

  it('accepts a snapshot whose event has no Meet link', () => {
    const { meetLink: _meetLink, ...weeklySyncWithoutMeetLink } = weeklySync;
    const snapshot = snapshotOf(weeklySyncWithoutMeetLink);

    expect(calendarSnapshot.parse(snapshot)).toEqual(snapshot);
  });
});
