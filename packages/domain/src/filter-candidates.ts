export interface DecidedProposal {
  messageId: string;
  accountEmail: string;
  from: string;
  verdict: { decision: string };
}

export interface FilterCandidate {
  accountEmail: string;
  criteria: { from: string };
  messageIds: string[];
}

const minimumConfirmedArchives = 3;

function groupConfirmedBySender(decidedProposals: DecidedProposal[]): DecidedProposal[][] {
  const confirmedBySender = new Map<string, DecidedProposal[]>();
  for (const proposal of decidedProposals) {
    if (proposal.verdict.decision === 'confirmed') {
      confirmedBySender.set(proposal.from, [...(confirmedBySender.get(proposal.from) ?? []), proposal]);
    }
  }
  return [...confirmedBySender.values()];
}

export function filterCandidates(decidedProposals: DecidedProposal[]): FilterCandidate[] {
  return groupConfirmedBySender(decidedProposals)
    .filter((proposals) => proposals.length >= minimumConfirmedArchives)
    .map((proposals) => {
      const [first] = proposals as [DecidedProposal];
      return {
        accountEmail: first.accountEmail,
        criteria: { from: first.from },
        messageIds: proposals.map((proposal) => proposal.messageId),
      };
    });
}
