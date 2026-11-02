import { z } from 'zod';

import type { CalendarSnapshot } from '@my-life/domain';

const calendarEvent = z.object({
  id: z.string(),
  iCalUID: z.string(),
  title: z.string(),
  allDay: z.boolean().optional(),
  start: z.string(),
  end: z.string(),
  meetLink: z.string().optional(),
  attendees: z.array(z.object({ email: z.string(), displayName: z.string() })),
});

// What the extension in one Chrome profile posts to the backend after polling that account's calendars.
export const calendarSnapshot = z.object({
  accountEmail: z.string(),
  events: z.array(calendarEvent),
}) satisfies z.ZodType<CalendarSnapshot>;
