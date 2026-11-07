interface Proposal {
  messageId: string;
  threadId?: string;
  date?: string;
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

interface ReportedMessage {
  id: string;
  date: string;
}

interface TriageQueue<Message extends ReportedMessage> {
  waiting: Proposal[];
  groups: ProposalGroup[];
  remaining: Message[];
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
  groupBy(proposals, (proposal) => proposal.category)
    .map(({ key, proposals }) => categoryGroup(key, proposals))
    .sort((first, second) => rankOf(first) - rankOf(second) || second.proposals.length - first.proposals.length);

const leadingCategories = ['action', 'unknown'];

export const isLeadingCategory = (category: string | undefined): boolean => leadingCategories.includes(category ?? '');

const rankOf = (group: ProposalGroup): number => (isLeadingCategory(group.category) ? 0 : 1);

const categoryGroup = (category: string | undefined, proposals: Proposal[]): ProposalGroup => {
  if (category === 'system-update') return { category, proposals, systems: groupBySystem(proposals) };
  if (category === 'cc-thread') return { category, proposals: newestPerThread(proposals) };
  return { category, proposals };
};

const newestPerThread = (proposals: Proposal[]): Proposal[] =>
  groupBy(proposals, (proposal) => proposal.threadId).map(({ proposals }) => newest(proposals));

const newest = (proposals: Proposal[]): Proposal =>
  proposals.reduce((latest, proposal) => (timeOf(proposal) > timeOf(latest) ? proposal : latest));

const timeOf = (proposal: Proposal): number => Date.parse(proposal.date ?? '');

const groupBySystem = (proposals: Proposal[]): SystemGroup[] =>
  groupBy(proposals, (proposal) => proposal.extract?.system).map(({ key, proposals }) => ({
    system: key,
    proposals,
  }));

export const hasVerdict = (proposal: { messageId: string }, verdicts: Verdict[]): boolean =>
  verdicts.some((verdict) => verdict.messageId === proposal.messageId);

const hasProposal = (message: ReportedMessage, proposals: Proposal[]): boolean =>
  proposals.some((proposal) => proposal.messageId === message.id);

const unproposed = <Message extends ReportedMessage>(messages: Message[], proposals: Proposal[]): Message[] =>
  messages
    .filter((message) => !hasProposal(message, proposals))
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date));

export const triageQueue = <Message extends ReportedMessage = ReportedMessage>(
  proposals: Proposal[],
  verdicts: Verdict[],
  messages: Message[] = [],
): TriageQueue<Message> => {
  const waiting = proposals.filter((proposal) => !hasVerdict(proposal, verdicts));
  return { waiting, groups: groupByCategory(waiting), remaining: unproposed(messages, proposals) };
};
