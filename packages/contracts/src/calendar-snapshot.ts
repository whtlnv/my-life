import { z } from 'zod';

const calendarEvent = z.object({
  id: z.string(),
  iCalUID: z.string(),
  title: z.string(),
  allDay: z.boolean().optional(),
  start: z.string(),
  end: z.string(),
  meetLink: z.string(),
  attendees: z.array(z.object({ email: z.string(), displayName: z.string() })),
});

// What the extension in one Chrome profile posts to the backend after polling that account's calendars.
export const calendarSnapshot = z.object({
  accountEmail: z.string(),
  events: z.array(calendarEvent),
});
export type CalendarSnapshot = z.infer<typeof calendarSnapshot>;
