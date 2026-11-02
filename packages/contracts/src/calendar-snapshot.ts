import { z } from 'zod';

// What the extension in one Chrome profile posts to the backend after polling that account's calendars.
export const calendarSnapshot = z.object({
  accountEmail: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      iCalUID: z.string(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      meetLink: z.string(),
      attendees: z.array(z.object({ email: z.string(), displayName: z.string() })),
    }),
  ),
});
export type CalendarSnapshot = z.infer<typeof calendarSnapshot>;
