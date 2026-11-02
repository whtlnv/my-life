import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';

const FIFTEEN_MINUTES_IN_MILLISECONDS = 15 * 60 * 1000;

const isHappeningAt = (event: MergedCalendarEvent, now: string): boolean =>
  event.start <= now && now < event.end;

const isStartingBetween = (
  event: MergedCalendarEvent,
  now: string,
  horizon: string,
): boolean => now < event.start && event.start <= horizon;

const byStartAscending = (
  left: MergedCalendarEvent,
  right: MergedCalendarEvent,
): number => left.start.localeCompare(right.start);

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
    current: events
      .filter((event) => isHappeningAt(event, now))
      .sort(byStartAscending),
    next: events.filter((event) => isStartingBetween(event, now, horizon)),
  };
};
