import { taskRanks } from '@my-life/contracts';

import { type ClaudePricing, type ClaudeResponse, readToolUseInput } from './claude-triage';

interface ClaudePrioritizationDependencies {
  model: string;
  pricing: ClaudePricing;
  createMessage: (request: { model: string }) => Promise<ClaudeResponse>;
}

interface TaskRank {
  taskId: string;
  rank: number;
  reason: string;
}

interface PrioritizationContext {
  tasks: { id: string; title: string; accountEmail: string; due?: string }[];
  profile: string;
  calendar: unknown[];
  urgentContacts: unknown[];
}

interface ClaudePrioritization {
  prioritize: (context: PrioritizationContext) => Promise<{ ranks?: TaskRank[]; failure?: { input: unknown } }>;
}

export function createClaudePrioritization({
  model,
  createMessage,
}: ClaudePrioritizationDependencies): ClaudePrioritization {
  return {
    prioritize: async () => {
      const response = await createMessage({ model });
      const input = readToolUseInput(response);
      const parsed = taskRanks.safeParse(input);
      return parsed.success ? { ranks: parsed.data.ranks } : { failure: { input } };
    },
  };
}
