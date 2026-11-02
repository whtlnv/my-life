import { describe, expect, it } from 'vitest';

import { calendarSnapshot } from './calendar-snapshot';

describe('calendarSnapshot', () => {
  it('accepts a snapshot with the account email and a full event', () => {
    const snapshot = {
      accountEmail: 'francisco@example.com',
      events: [
        {
          id: 'event-1',
          iCalUID: 'event-1@google.com',
          title: 'Weekly sync',
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T15:30:00.000Z',
          meetLink: 'https://meet.google.com/abc-defg-hij',
          attendees: [{ email: 'ana@example.com', displayName: 'Ana' }],
        },
      ],
    };

    expect(calendarSnapshot.parse(snapshot)).toEqual(snapshot);
  });
});
