import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';
import { buildNowView } from './now-view';

export const badgeCount = (
  events: MergedCalendarEvent[],
  clock: Clock,
): number => buildNowView(events, clock).next.length;
