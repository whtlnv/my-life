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

export function filterCandidates(decidedProposals: DecidedProposal[]): FilterCandidate[] {
  const confirmed = decidedProposals.filter((proposal) => proposal.verdict.decision === 'confirmed');
  if (confirmed.length < minimumConfirmedArchives) {
    return [];
  }
  const [first] = confirmed as [DecidedProposal];
  return [
    {
      accountEmail: first.accountEmail,
      criteria: { from: first.from },
      messageIds: confirmed.map((proposal) => proposal.messageId),
    },
  ];
}
