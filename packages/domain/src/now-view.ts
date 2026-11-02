import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';

const FIFTEEN_MINUTES_IN_MILLISECONDS = 15 * 60 * 1000;

export const buildNowView = (
  events: MergedCalendarEvent[],
  clock: Clock,
): { current: MergedCalendarEvent[]; next: MergedCalendarEvent[] } => {
  const nowDate = clock.now();
  const now = nowDate.toISOString();
  const horizon = new Date(
    nowDate.getTime() + FIFTEEN_MINUTES_IN_MILLISECONDS,
  ).toISOString();
  return {
    current: events.filter((event) => event.start <= now && now < event.end),
    next: events.filter((event) => now < event.start && event.start <= horizon),
  };
};
