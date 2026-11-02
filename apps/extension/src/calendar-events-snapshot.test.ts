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

  it('leaves out an event the account has declined', () => {
    const calendarEvent = (id: string, ownResponseStatus: string) => ({
      kind: 'calendar#event',
      id,
      iCalUID: `${id}@google.com`,
      status: 'confirmed',
      summary: `Meeting ${id}`,
      start: { dateTime: '2026-11-02T09:00:00-06:00', timeZone: 'America/Mexico_City' },
      end: { dateTime: '2026-11-02T09:30:00-06:00', timeZone: 'America/Mexico_City' },
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
      attendees: [
        { email: 'ana@example.com', displayName: 'Ana', responseStatus: 'accepted' },
        { email: 'francisco@example.com', displayName: 'Francisco', self: true, responseStatus: ownResponseStatus },
      ],
    });
    const eventsResponse = {
      kind: 'calendar#events',
      items: [calendarEvent('accepted-event', 'accepted'), calendarEvent('declined-event', 'declined')],
    };

    const snapshot = snapshotFromCalendarEvents('francisco@example.com', eventsResponse);

    expect(snapshot.events.map((event) => event.id)).toEqual(['accepted-event']);
  });

  it('turns an all-day Calendar event into an all-day event in the snapshot', () => {
    const eventsResponse = {
      kind: 'calendar#events',
      items: [
        {
          kind: 'calendar#event',
          id: 'offsite',
          iCalUID: 'offsite@google.com',
          status: 'confirmed',
          summary: 'Team offsite',
          start: { date: '2026-11-03' },
          end: { date: '2026-11-04' },
          hangoutLink: 'https://meet.google.com/off-site-xyz',
          attendees: [],
        },
      ],
    };

    const snapshot = snapshotFromCalendarEvents('francisco@example.com', eventsResponse);

    expect(snapshot.events).toEqual([
      expect.objectContaining({ id: 'offsite', allDay: true, start: '2026-11-03', end: '2026-11-04' }),
    ]);
  });

  it('converts a Calendar event without a Meet link with no meetLink field at all, never null', () => {
    const eventsResponse = {
      kind: 'calendar#events',
      items: [
        {
          kind: 'calendar#event',
          id: 'lunch',
          iCalUID: 'lunch@google.com',
          status: 'confirmed',
          summary: 'Lunch',
          start: { dateTime: '2026-11-02T14:00:00-06:00', timeZone: 'America/Mexico_City' },
          end: { dateTime: '2026-11-02T15:00:00-06:00', timeZone: 'America/Mexico_City' },
          attendees: [],
        },
      ],
    };

    const snapshot = snapshotFromCalendarEvents('francisco@example.com', eventsResponse);

    expect(snapshot.events.map((event) => Object.keys(event))).toEqual([expect.not.arrayContaining(['meetLink'])]);
  });

  it('converts a Calendar event with no attendees with an empty attendee list', () => {
    const eventsResponse = {
      kind: 'calendar#events',
      items: [
        {
          kind: 'calendar#event',
          id: 'focus-time',
          iCalUID: 'focus-time@google.com',
          status: 'confirmed',
          summary: 'Focus time',
          start: { dateTime: '2026-11-02T10:00:00-06:00', timeZone: 'America/Mexico_City' },
          end: { dateTime: '2026-11-02T12:00:00-06:00', timeZone: 'America/Mexico_City' },
        },
      ],
    };

    const snapshot = snapshotFromCalendarEvents('francisco@example.com', eventsResponse);

    expect(snapshot.events).toEqual([expect.objectContaining({ id: 'focus-time', attendees: [] })]);
  });

  it('converts an attendee without a display name with the email as the display name', () => {
    const eventsResponse = {
      kind: 'calendar#events',
      items: [
        {
          kind: 'calendar#event',
          id: 'vendor-call',
          iCalUID: 'vendor-call@google.com',
          status: 'confirmed',
          summary: 'Vendor call',
          start: { dateTime: '2026-11-02T16:00:00-06:00', timeZone: 'America/Mexico_City' },
          end: { dateTime: '2026-11-02T16:30:00-06:00', timeZone: 'America/Mexico_City' },
          attendees: [{ email: 'vendor@example.com', responseStatus: 'needsAction' }],
        },
      ],
    };

    const snapshot = snapshotFromCalendarEvents('francisco@example.com', eventsResponse);

    expect(snapshot.events[0]?.attendees).toEqual([{ email: 'vendor@example.com', displayName: 'vendor@example.com' }]);
  });
});
