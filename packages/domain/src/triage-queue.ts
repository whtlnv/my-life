interface Proposal {
  messageId: string;
  accountEmail: string;
  action: string;
  category?: string;
}

export const triageQueue: (proposals: Proposal[], verdicts: unknown[]) => { waiting: Proposal[] } = (proposals) => ({
  waiting: proposals,
});
