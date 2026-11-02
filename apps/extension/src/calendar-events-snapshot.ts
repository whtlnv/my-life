interface GoogleCalendarEventFields {
  id: string;
  iCalUID: string;
  summary: string;
  hangoutLink?: string;
  attendees?: { email: string; displayName?: string; self?: boolean; responseStatus?: string }[];
}

type AllDayGoogleCalendarEvent = GoogleCalendarEventFields & { start: { date: string }; end: { date: string } };

type TimedGoogleCalendarEvent = GoogleCalendarEventFields & { start: { dateTime: string }; end: { dateTime: string } };

type GoogleCalendarEvent = AllDayGoogleCalendarEvent | TimedGoogleCalendarEvent;

function isAllDay(event: GoogleCalendarEvent): event is AllDayGoogleCalendarEvent {
  return 'date' in event.start;
}

export interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEvent[];
}

function attendeesOf(event: GoogleCalendarEvent) {
  return event.attendees ?? [];
}

function isDeclinedByAccount(event: GoogleCalendarEvent) {
  return attendeesOf(event).some((attendee) => attendee.self === true && attendee.responseStatus === 'declined');
}

function snapshotAttendeesOf(event: GoogleCalendarEvent) {
  return attendeesOf(event).map((attendee) => ({
    email: attendee.email,
    displayName: attendee.displayName ?? attendee.email,
  }));
}

function snapshotEventFromCalendarEvent(event: GoogleCalendarEvent) {
  const commonFields = {
    id: event.id,
    iCalUID: event.iCalUID,
    title: event.summary,
    ...(event.hangoutLink === undefined ? {} : { meetLink: event.hangoutLink }),
    attendees: snapshotAttendeesOf(event),
  };
  if (isAllDay(event)) {
    return { ...commonFields, allDay: true, start: event.start.date, end: event.end.date };
  }
  return {
    ...commonFields,
    start: new Date(event.start.dateTime).toISOString(),
    end: new Date(event.end.dateTime).toISOString(),
  };
}

export function snapshotFromCalendarEvents(accountEmail: string, eventsResponse: GoogleCalendarEventsResponse) {
  return {
    accountEmail,
    events: eventsResponse.items.filter((event) => !isDeclinedByAccount(event)).map(snapshotEventFromCalendarEvent),
  };
}
