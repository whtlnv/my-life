interface Proposal {
  messageId: string;
  threadId?: string;
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

const groupBy = <Key>(
  proposals: Proposal[],
  keyOf: (proposal: Proposal) => Key,
): { key: Key; proposals: Proposal[] }[] => {
  const groups: { key: Key; proposals: Proposal[] }[] = [];
  for (const proposal of proposals) {
    const key = keyOf(proposal);
    const group = groups.find((existing) => existing.key === key);
    if (group) group.proposals.push(proposal);
    else groups.push({ key, proposals: [proposal] });
  }
  return groups;
};

const groupByCategory = (proposals: Proposal[]): ProposalGroup[] =>
  groupBy(proposals, (proposal) => proposal.category).map(({ key, proposals }) =>
    key === 'system-update'
      ? { category: key, proposals, systems: groupBySystem(proposals) }
      : key === 'cc-thread'
        ? { category: key, proposals: newestPerThread(proposals) }
        : { category: key, proposals },
  );

const newestPerThread = (proposals: Proposal[]): Proposal[] =>
  groupBy(proposals, (proposal) => proposal.threadId).flatMap(({ proposals }) => proposals.slice(-1));

const groupBySystem = (proposals: Proposal[]): SystemGroup[] =>
  groupBy(proposals, (proposal) => proposal.extract?.system).map(({ key, proposals }) => ({
    system: key,
    proposals,
  }));

const hasVerdict = (proposal: Proposal, verdicts: Verdict[]): boolean =>
  verdicts.some((verdict) => verdict.messageId === proposal.messageId);

export const triageQueue = (proposals: Proposal[], verdicts: Verdict[]): TriageQueue => {
  const waiting = proposals.filter((proposal) => !hasVerdict(proposal, verdicts));
  return { waiting, groups: groupByCategory(waiting) };
};
