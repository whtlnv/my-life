import { type ClaudePricing, type ClaudeResponse, readToolUseInput } from './claude-triage';

interface ClaudeSummaryDependencies {
  model: string;
  pricing: ClaudePricing;
  createMessage: (request: { model: string }) => Promise<ClaudeResponse>;
}

export function createClaudeSummary({ model, createMessage }: ClaudeSummaryDependencies) {
  return {
    summarize: async (_request: { items: { summary: string }[] }) => {
      const response = await createMessage({ model });
      return readToolUseInput(response);
    },
  };
}
