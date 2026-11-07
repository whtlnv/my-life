import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';
import { buildNowView } from './now-view';

interface Proposal {
  messageId: string;
  category: string;
}

interface Verdict {
  messageId: string;
}

export const badgeCount = (
  events: MergedCalendarEvent[],
  clock: Clock,
  proposals: Proposal[] = [],
  verdicts: Verdict[] = [],
): number => {
  const waitingProposals = proposals.filter(
    (proposal) =>
      proposal.category === 'action' &&
      !verdicts.some((verdict) => verdict.messageId === proposal.messageId),
  );
  return buildNowView(events, clock).next.length + waitingProposals.length;
};
