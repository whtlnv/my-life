import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { filterProposal } from '@my-life/contracts';

import type { TriagePricing } from './claude-triage';

interface ClaudeResponse {
  content: { type: string; input?: unknown }[];
}

interface ClaudeFilterDependencies {
  model: string;
  promptPath: string;
  pricing: TriagePricing;
  createMessage: (request: {
    model: string;
    system: string;
    tools: { name: string; strict: boolean; input_schema: unknown }[];
    messages: { role: 'user'; content: string }[];
  }) => Promise<ClaudeResponse>;
}

interface FilterCandidate {
  accountEmail: string;
  criteria: { from?: string; subject?: string; listId?: string };
  messageIds: string[];
  messages?: { from: string; subject: string }[];
}

const proposeFilterTool = { name: 'propose_filter', strict: true, input_schema: filterProposal.toJSONSchema() };

export function createClaudeFilter({ model, promptPath, createMessage }: ClaudeFilterDependencies) {
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
      return { promptVersion, proposal: filterProposal.parse(input) };
    },
  };
}
