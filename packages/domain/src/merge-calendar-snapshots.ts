interface CalendarEvent {
  id: string;
  iCalUID: string;
  title: string;
  allDay?: boolean;
  start: string;
  end: string;
  meetLink?: string;
  attendees: { email: string; displayName: string }[];
}

export interface CalendarSnapshot {
  accountEmail: string;
  events: CalendarEvent[];
}

export type MergedCalendarEvent = CalendarEvent & { accounts: string[] };

export const mergeCalendarSnapshots = (
  snapshots: CalendarSnapshot[],
): MergedCalendarEvent[] => {
  const merged: MergedCalendarEvent[] = [];
  for (const { accountEmail, events } of snapshots) {
    for (const event of events) {
      const existing = merged.find((candidate) => candidate.iCalUID === event.iCalUID);
      if (existing) {
        existing.accounts.push(accountEmail);
      } else {
        merged.push({ ...event, accounts: [accountEmail] });
      }
    }
  }
  return merged;
};
