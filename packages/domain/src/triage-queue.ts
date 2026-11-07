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

const groupByCategory = (proposals: Proposal[]): ProposalGroup[] => {
  const groups: ProposalGroup[] = [];
  for (const proposal of proposals) {
    const group = groups.find((existing) => existing.category === proposal.category);
    if (group) group.proposals.push(proposal);
    else groups.push({ category: proposal.category, proposals: [proposal] });
  }
  return groups;
};

export const triageQueue: (
  proposals: Proposal[],
  verdicts: Verdict[],
) => { waiting: Proposal[]; groups: ProposalGroup[] } = (proposals, verdicts) => {
  const waiting = proposals.filter((proposal) => !verdicts.some((verdict) => verdict.messageId === proposal.messageId));
  return { waiting, groups: groupByCategory(waiting) };
};
