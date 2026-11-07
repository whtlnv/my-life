export interface DecidedProposal {
  messageId: string;
  accountEmail: string;
  from: string;
  listId?: string;
  action: string;
  verdict: { decision: string; correction?: { action: string } };
}

export interface FilterCandidate {
  accountEmail: string;
  criteria: { from: string } | { listId: string };
  messageIds: string[];
}

const minimumDecidedArchives = 3;

function decidedActionOf(proposal: DecidedProposal): string | undefined {
  return (
    proposal.verdict.correction?.action ?? (proposal.verdict.decision === 'confirmed' ? proposal.action : undefined)
  );
}

function groupArchivesByFilterKey(decidedProposals: DecidedProposal[]): DecidedProposal[][] {
  const archivesByFilterKey = new Map<string, DecidedProposal[]>();
  for (const proposal of decidedProposals) {
    if (decidedActionOf(proposal) === 'archive') {
      const key = JSON.stringify([proposal.accountEmail, proposal.listId ?? proposal.from]);
      archivesByFilterKey.set(key, [...(archivesByFilterKey.get(key) ?? []), proposal]);
    }
  }
  return [...archivesByFilterKey.values()];
}

export function filterCandidates(decidedProposals: DecidedProposal[]): FilterCandidate[] {
  return groupArchivesByFilterKey(decidedProposals)
    .filter((proposals) => proposals.length >= minimumDecidedArchives)
    .map((proposals) => {
      const [first] = proposals as [DecidedProposal];
      return {
        accountEmail: first.accountEmail,
        criteria: first.listId === undefined ? { from: first.from } : { listId: first.listId },
        messageIds: proposals.map((proposal) => proposal.messageId),
      };
    });
}
