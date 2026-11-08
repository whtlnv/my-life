// Two models behind one Triage port: a cheap first opinion for every message, and a second, stronger opinion only
// where a mistake would cost the user attention: when the first model says the message needs them (`action`) or
// cannot place it (`unknown`), or when it fails to answer at all. The second model's proposal wins; both calls are
// paid for, so the cost reported is the sum.

interface TriageOutcome {
  costInUsd: number;
  model?: string;
  proposal?: unknown;
  promptVersion: string;
}

interface Triage<Message> {
  propose: (message: Message, examples?: unknown[]) => Promise<TriageOutcome>;
}

const escalatedCategories = new Set(['action', 'unknown']);

function needsSecondOpinion(outcome: TriageOutcome): boolean {
  const proposal = outcome.proposal as { category?: string } | undefined;
  return proposal === undefined || escalatedCategories.has(proposal.category ?? '');
}

export function createEscalatingTriage<Message>({
  first,
  second,
}: {
  first: Triage<Message>;
  second: Triage<Message>;
}): Triage<Message> {
  return {
    propose: async (message, examples) => {
      const firstOpinion = await first.propose(message, examples);
      if (!needsSecondOpinion(firstOpinion)) return firstOpinion;
      const secondOpinion = await second.propose(message, examples);
      const firstCategory = (firstOpinion.proposal as { category?: string } | undefined)?.category;
      const secondCategory = (secondOpinion.proposal as { category?: string } | undefined)?.category;
      return {
        ...secondOpinion,
        proposal: { ...(secondOpinion.proposal as object), disagreement: { firstCategory, secondCategory } },
        costInUsd: firstOpinion.costInUsd + secondOpinion.costInUsd,
      };
    },
  };
}
