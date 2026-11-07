import type { Clock } from './clock';
import type { MergedCalendarEvent } from './merge-calendar-snapshots';
import { buildNowView } from './now-view';

interface Proposal {
  messageId: string;
  category?: string;
}

interface Verdict {
  messageId: string;
}

const isWaitingAction = (proposal: Proposal, verdicts: Verdict[]): boolean =>
  proposal.category === 'action' && !verdicts.some((verdict) => verdict.messageId === proposal.messageId);

export const badgeCount = (
  events: MergedCalendarEvent[],
  clock: Clock,
  proposals: Proposal[] = [],
  verdicts: Verdict[] = [],
): number => {
  const waitingActions = proposals.filter((proposal) => isWaitingAction(proposal, verdicts));
  return buildNowView(events, clock).next.length + waitingActions.length;
};
