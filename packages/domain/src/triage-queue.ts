interface Proposal {
  messageId: string;
  accountEmail: string;
  action: string;
  category?: string;
}

interface Verdict {
  messageId: string;
}

export const triageQueue: (proposals: Proposal[], verdicts: Verdict[]) => { waiting: Proposal[] } = (
  proposals,
  verdicts,
) => ({
  waiting: proposals.filter((proposal) => !verdicts.some((verdict) => verdict.messageId === proposal.messageId)),
});
