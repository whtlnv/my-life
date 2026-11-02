type GoogleCalendarEvent = {
  id: string;
  iCalUID: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  hangoutLink: string;
  attendees: { email: string; displayName: string; self?: boolean; responseStatus?: string }[];
};

type GoogleCalendarEventsResponse = {
  items: GoogleCalendarEvent[];
};

function isDeclinedByAccount(event: GoogleCalendarEvent) {
  return event.attendees.some((attendee) => attendee.self === true && attendee.responseStatus === 'declined');
}

function snapshotEventFromCalendarEvent(event: GoogleCalendarEvent) {
  return {
    id: event.id,
    iCalUID: event.iCalUID,
    title: event.summary,
    start: new Date(event.start.dateTime).toISOString(),
    end: new Date(event.end.dateTime).toISOString(),
    meetLink: event.hangoutLink,
    attendees: event.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.displayName })),
  };
}

export function snapshotFromCalendarEvents(accountEmail: string, eventsResponse: GoogleCalendarEventsResponse) {
  return {
    accountEmail,
    events: eventsResponse.items.filter((event) => !isDeclinedByAccount(event)).map(snapshotEventFromCalendarEvent),
  };
}
