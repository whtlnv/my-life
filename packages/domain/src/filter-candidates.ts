export interface DecidedProposal {
  messageId: string;
  accountEmail: string;
  from: string;
  listId?: string;
  verdict: { decision: string };
}

export interface FilterCandidate {
  accountEmail: string;
  criteria: { from: string } | { listId: string };
  messageIds: string[];
}

const minimumConfirmedArchives = 3;

function groupConfirmedByFilterKey(decidedProposals: DecidedProposal[]): DecidedProposal[][] {
  const confirmedByFilterKey = new Map<string, DecidedProposal[]>();
  for (const proposal of decidedProposals) {
    if (proposal.verdict.decision === 'confirmed') {
      const key = JSON.stringify([proposal.accountEmail, proposal.listId ?? proposal.from]);
      confirmedByFilterKey.set(key, [...(confirmedByFilterKey.get(key) ?? []), proposal]);
    }
  }
  return [...confirmedByFilterKey.values()];
}

export function filterCandidates(decidedProposals: DecidedProposal[]): FilterCandidate[] {
  return groupConfirmedByFilterKey(decidedProposals)
    .filter((proposals) => proposals.length >= minimumConfirmedArchives)
    .map((proposals) => {
      const [first] = proposals as [DecidedProposal];
      return {
        accountEmail: first.accountEmail,
        criteria: first.listId === undefined ? { from: first.from } : { listId: first.listId },
        messageIds: proposals.map((proposal) => proposal.messageId),
      };
    });
}
