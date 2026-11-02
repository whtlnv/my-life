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

const localCalendarDate = (
  instant: string,
  timeZone: string | undefined,
): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(
    new Date(instant),
  );

const isLaterToday = (
  event: MergedCalendarEvent,
  horizon: string,
  today: string,
  timeZone: string | undefined,
): boolean =>
  horizon < event.start && localCalendarDate(event.start, timeZone) === today;

const byStartAscending = (
  left: MergedCalendarEvent,
  right: MergedCalendarEvent,
): number => left.start.localeCompare(right.start);

export const buildNowView = (
  events: MergedCalendarEvent[],
  clock: Clock,
  timeZone?: string,
): {
  current: MergedCalendarEvent[];
  next: MergedCalendarEvent[];
  laterToday: MergedCalendarEvent[];
} => {
  const nowDate = clock.now();
  const now = nowDate.toISOString();
  const horizon = new Date(
    nowDate.getTime() + FIFTEEN_MINUTES_IN_MILLISECONDS,
  ).toISOString();
  const today = localCalendarDate(now, timeZone);
  return {
    current: events
      .filter((event) => isHappeningAt(event, now))
      .sort(byStartAscending),
    next: events.filter((event) => isStartingBetween(event, now, horizon)),
    laterToday: events
      .filter((event) => isLaterToday(event, horizon, today, timeZone))
      .sort(byStartAscending),
  };
};
