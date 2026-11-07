interface Proposal {
  messageId: string;
  accountEmail: string;
  action: string;
  category?: string;
}

interface Verdict {
  messageId: string;
}

interface ProposalGroup {
  category: string | undefined;
  proposals: Proposal[];
}

interface TriageQueue {
  waiting: Proposal[];
  groups: ProposalGroup[];
}

const groupByCategory = (proposals: Proposal[]): ProposalGroup[] => {
  const groups: ProposalGroup[] = [];
  for (const proposal of proposals) {
    const group = groups.find((existing) => existing.category === proposal.category);
    if (group) group.proposals.push(proposal);
    else groups.push({ category: proposal.category, proposals: [proposal] });
  }
  return groups;
};

const hasVerdict = (proposal: Proposal, verdicts: Verdict[]): boolean =>
  verdicts.some((verdict) => verdict.messageId === proposal.messageId);

export const triageQueue = (proposals: Proposal[], verdicts: Verdict[]): TriageQueue => {
  const waiting = proposals.filter((proposal) => !hasVerdict(proposal, verdicts));
  return { waiting, groups: groupByCategory(waiting) };
};
