import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';
import { buildNowView } from './now-view';

interface Proposal {
  messageId: string;
}

interface Verdict {
  messageId: string;
}

export const badgeCount = (
  events: MergedCalendarEvent[],
  clock: Clock,
  proposals: Proposal[] = [],
  verdicts: Verdict[] = [],
): number =>
  buildNowView(events, clock).next.length +
  proposals.filter((proposal) => !verdicts.some((verdict) => verdict.messageId === proposal.messageId))
    .length;
