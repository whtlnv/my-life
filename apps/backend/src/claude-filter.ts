import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { filterProposal } from '@my-life/contracts';

import { computeCostInUsd, type ClaudePricing, type ClaudeRequest, type ClaudeResponse } from './claude-triage';

interface ClaudeFilterDependencies {
  model: string;
  promptPath: string;
  pricing: ClaudePricing;
  createMessage: (request: ClaudeRequest) => Promise<ClaudeResponse>;
}

interface FilterCandidate {
  accountEmail: string;
  criteria: { from?: string; subject?: string; listId?: string };
  messageIds: string[];
  messages?: { from: string; subject: string }[];
}

const proposeFilterTool = { name: 'propose_filter', strict: true, input_schema: filterProposal.toJSONSchema() };

export function createClaudeFilter({ model, promptPath, pricing, createMessage }: ClaudeFilterDependencies) {
  const promptVersion = basename(promptPath, extname(promptPath));
  return {
    propose: async (candidate: FilterCandidate) => {
      const system = readFileSync(promptPath, 'utf8');
      const response = await createMessage({
        model,
        system,
        tools: [proposeFilterTool],
        messages: [{ role: 'user', content: JSON.stringify(candidate) }],
      });
      const input = response.content.find((block) => block.type === 'tool_use')?.input;
      return {
        promptVersion,
        proposal: filterProposal.parse(input),
        costInUsd: computeCostInUsd(response.usage, pricing),
      };
    },
  };
}
