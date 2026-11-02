import { describe, expect, it } from 'vitest';

import { snapshotFromCalendarEvents } from './calendar-events-snapshot';

describe('snapshotFromCalendarEvents', () => {
  it('converts a Google Calendar events response into a snapshot with title, start, end, Meet link, attendees and iCalUID', () => {
    const eventsResponse = {
      kind: 'calendar#events',
      items: [
        {
          kind: 'calendar#event',
          id: 'event-1',
          iCalUID: 'event-1@google.com',
          status: 'confirmed',
          summary: 'Weekly sync',
          start: { dateTime: '2026-11-02T09:00:00-06:00', timeZone: 'America/Mexico_City' },
          end: { dateTime: '2026-11-02T09:30:00-06:00', timeZone: 'America/Mexico_City' },
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          attendees: [
            { email: 'ana@example.com', displayName: 'Ana', responseStatus: 'accepted' },
            { email: 'francisco@example.com', displayName: 'Francisco', self: true, responseStatus: 'accepted' },
          ],
        },
      ],
    };

    expect(snapshotFromCalendarEvents('francisco@example.com', eventsResponse)).toEqual({
      accountEmail: 'francisco@example.com',
      events: [
        {
          id: 'event-1',
          iCalUID: 'event-1@google.com',
          title: 'Weekly sync',
          start: '2026-11-02T15:00:00.000Z',
          end: '2026-11-02T15:30:00.000Z',
          meetLink: 'https://meet.google.com/abc-defg-hij',
          attendees: [
            { email: 'ana@example.com', displayName: 'Ana' },
            { email: 'francisco@example.com', displayName: 'Francisco' },
          ],
        },
      ],
    });
  });
});
