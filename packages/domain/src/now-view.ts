import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';

export const buildNowView = (
  events: MergedCalendarEvent[],
  clock: Clock,
): { current: MergedCalendarEvent[]; next: MergedCalendarEvent[] } => {
  const now = clock.now().toISOString();
  return {
    current: events.filter((event) => event.start <= now && now < event.end),
    next: events.filter((event) => now < event.start),
  };
};
