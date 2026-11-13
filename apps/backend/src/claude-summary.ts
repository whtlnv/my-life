import { readFileSync } from 'node:fs';

import { digestSummary } from '@my-life/contracts';

import { type ClaudePricing, type ClaudeResponse, computeCostInUsd, readToolUseInput } from './claude-triage';

const summaryToolName = 'write_summary';

interface ClaudeSummaryRequest {
  model: string;
  system?: string;
  tools: { name: string }[];
  tool_choice: { type: 'tool'; name: string };
  messages: { role: string; content: string }[];
}

interface ClaudeSummaryDependencies {
  model: string;
  promptPath?: string;
  pricing: ClaudePricing;
  createMessage: (request: ClaudeSummaryRequest) => Promise<ClaudeResponse>;
}

export function createClaudeSummary({ model, promptPath, pricing, createMessage }: ClaudeSummaryDependencies) {
  return {
    summarize: async ({ items }: { items: { summary: string }[] }) => {
      const response = await createMessage({
        model,
        ...(promptPath === undefined ? {} : { system: readFileSync(promptPath, 'utf8') }),
        tools: [{ name: summaryToolName }],
        tool_choice: { type: 'tool', name: summaryToolName },
        messages: [{ role: 'user', content: items.map(({ summary }) => summary).join('\n') }],
      });
      const costInUsd = computeCostInUsd(response.usage, pricing);
      const parsed = digestSummary.safeParse(readToolUseInput(response));
      if (!parsed.success) throw Object.assign(parsed.error, { costInUsd });
      return { lines: parsed.data.lines, costInUsd };
    },
  };
}
