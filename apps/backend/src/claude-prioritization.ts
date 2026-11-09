import { readFileSync } from 'node:fs';

import { type TaskRanks, taskRanks } from '@my-life/contracts';

import { type ClaudePricing, type ClaudeResponse, computeCostInUsd, readToolUseInput } from './claude-triage';

interface ClaudePrioritizationDependencies {
  model: string;
  promptPath?: string;
  pricing: ClaudePricing;
  createMessage: (request: {
    model: string;
    system: string;
    messages: { role: string; content: string }[];
    tools: { name: string; input_schema: unknown }[];
    tool_choice: { type: string; name: string };
  }) => Promise<ClaudeResponse>;
}

interface PrioritizationContext {
  tasks: { id: string; title: string; accountEmail: string; due?: string | undefined; waitingOn?: string }[];
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

const rankTasksTool = { name: 'rank_tasks', input_schema: taskRanks.toJSONSchema() };

export function createClaudePrioritization({
  model,
  promptPath,
  pricing,
  createMessage,
}: ClaudePrioritizationDependencies): ClaudePrioritization {
  return {
    prioritize: async (context) => {
      const system = promptPath === undefined ? '' : readFileSync(promptPath, 'utf8');
      const messages = [{ role: 'user', content: JSON.stringify(context) }];
      const toolChoice = { type: 'tool', name: rankTasksTool.name };
      const response = await createMessage({ model, system, messages, tools: [rankTasksTool], tool_choice: toolChoice });
      const input = readToolUseInput(response);
      const parsed = taskRanks.safeParse(input);
      if (!parsed.success) return { failure: { input } };
      return { ranks: parsed.data.ranks, costInUsd: computeCostInUsd(response.usage, pricing) };
    },
  };
}
