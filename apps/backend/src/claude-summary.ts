import type { ClaudePricing } from './claude-triage';

interface ClaudeSummaryDependencies {
  model: string;
  pricing: ClaudePricing;
  createMessage: (request: { model: string }) => Promise<unknown>;
}

export function createClaudeSummary({ model, createMessage }: ClaudeSummaryDependencies) {
  return {
    summarize: async (_request: { items: { summary: string }[] }) => {
      await createMessage({ model });
    },
  };
}
