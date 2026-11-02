interface CalendarEvent {
  id: string;
  iCalUID: string;
  title: string;
  start: string;
  end: string;
  meetLink?: string;
  attendees: { email: string; displayName: string }[];
}

interface CalendarSnapshot {
  accountEmail: string;
  events: CalendarEvent[];
}

export type MergedCalendarEvent = CalendarEvent & { accounts: string[] };

export const mergeCalendarSnapshots = (
  snapshots: CalendarSnapshot[],
): MergedCalendarEvent[] =>
  snapshots.flatMap(({ accountEmail, events }) =>
    events.map((event) => ({ ...event, accounts: [accountEmail] })),
  );
