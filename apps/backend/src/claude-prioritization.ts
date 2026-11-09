import { type TaskRanks, taskRanks } from '@my-life/contracts';

import { type ClaudePricing, type ClaudeResponse, computeCostInUsd, readToolUseInput } from './claude-triage';

interface ClaudePrioritizationDependencies {
  model: string;
  pricing: ClaudePricing;
  createMessage: (request: { model: string }) => Promise<ClaudeResponse>;
}

interface PrioritizationContext {
  tasks: { id: string; title: string; accountEmail: string; due?: string }[];
  profile: string;
  calendar: unknown[];
  urgentContacts: unknown[];
}

interface ClaudePrioritization {
  prioritize: (context: PrioritizationContext) => Promise<{
    ranks?: TaskRanks['ranks'];
    costInUsd?: number;
    failure?: { input: unknown };
  }>;
}

export function createClaudePrioritization({
  model,
  pricing,
  createMessage,
}: ClaudePrioritizationDependencies): ClaudePrioritization {
  return {
    prioritize: async () => {
      const response = await createMessage({ model });
      const input = readToolUseInput(response);
      const parsed = taskRanks.safeParse(input);
      return parsed.success ? { ranks: parsed.data.ranks, costInUsd: computeCostInUsd(response.usage, pricing) } : { failure: { input } };
    },
  };
}
