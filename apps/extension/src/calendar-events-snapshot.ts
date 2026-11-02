type GoogleCalendarEvent = {
  id: string;
  iCalUID: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  hangoutLink: string;
  attendees: { email: string; displayName: string }[];
};

type GoogleCalendarEventsResponse = {
  items: GoogleCalendarEvent[];
};

export function snapshotFromCalendarEvents(accountEmail: string, eventsResponse: GoogleCalendarEventsResponse) {
  return {
    accountEmail,
    events: eventsResponse.items.map((event) => ({
      id: event.id,
      iCalUID: event.iCalUID,
      title: event.summary,
      start: new Date(event.start.dateTime).toISOString(),
      end: new Date(event.end.dateTime).toISOString(),
      meetLink: event.hangoutLink,
      attendees: event.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.displayName })),
    })),
  };
}
