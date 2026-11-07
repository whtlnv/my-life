export interface DecidedProposal {
  messageId: string;
  accountEmail: string;
  from: string;
}

export interface FilterCandidate {
  accountEmail: string;
  criteria: { from: string };
  messageIds: string[];
}

export function filterCandidates(decidedProposals: DecidedProposal[]): FilterCandidate[] {
  if (decidedProposals.length < 3) {
    return [];
  }
  const [first] = decidedProposals as [DecidedProposal];
  return [
    {
      accountEmail: first.accountEmail,
      criteria: { from: first.from },
      messageIds: decidedProposals.map((proposal) => proposal.messageId),
    },
  ];
}
