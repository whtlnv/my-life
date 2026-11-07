interface Proposal {
  messageId: string;
  accountEmail: string;
  action: string;
  category?: string;
  extract?: { system?: string };
}

interface Verdict {
  messageId: string;
}

interface SystemGroup {
  system: string | undefined;
  proposals: Proposal[];
}

interface ProposalGroup {
  category: string | undefined;
  proposals: Proposal[];
  systems?: SystemGroup[];
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
  for (const group of groups) {
    if (group.category === 'system-update') group.systems = groupBySystem(group.proposals);
  }
  return groups;
};

const groupBySystem = (proposals: Proposal[]): SystemGroup[] => {
  const systems: SystemGroup[] = [];
  for (const proposal of proposals) {
    const system = systems.find((existing) => existing.system === proposal.extract?.system);
    if (system) system.proposals.push(proposal);
    else systems.push({ system: proposal.extract?.system, proposals: [proposal] });
  }
  return systems;
};

const hasVerdict = (proposal: Proposal, verdicts: Verdict[]): boolean =>
  verdicts.some((verdict) => verdict.messageId === proposal.messageId);

export const triageQueue = (proposals: Proposal[], verdicts: Verdict[]): TriageQueue => {
  const waiting = proposals.filter((proposal) => !hasVerdict(proposal, verdicts));
  return { waiting, groups: groupByCategory(waiting) };
};
