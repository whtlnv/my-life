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

describe('calendarSnapshot', () => {
  it('accepts a snapshot with the account email and a full event', () => {
    const snapshot = { accountEmail: 'francisco@example.com', events: [weeklySync] };

    expect(calendarSnapshot.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects a snapshot whose event has no start', () => {
    const snapshot = { accountEmail: 'francisco@example.com', events: [weeklySyncWithoutStart] };

    expect(calendarSnapshot.safeParse(snapshot).success).toBe(false);
  });
});
