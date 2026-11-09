import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ClaudePricing, ClaudeResponse } from './claude-triage';

interface ClaudeAgentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: string }[];
}

interface ClaudeAgentDependencies {
  model: string;
  promptPath: string;
  profileDirectory: string;
  pricing: ClaudePricing;
  createMessage: (request: ClaudeAgentRequest) => Promise<ClaudeResponse>;
}

export function createClaudeAgent({ model, promptPath, profileDirectory, createMessage }: ClaudeAgentDependencies) {
  return {
    respond: async ({ turns }: { turns: { role: string; text: string }[] }) => {
      const prompt = readFileSync(promptPath, 'utf8');
      const profile = readFileSync(join(profileDirectory, 'accounts.md'), 'utf8');
      await createMessage({
        model,
        system: `${prompt}\n\n${profile}`,
        messages: turns.map(({ role, text }) => ({ role, content: text })),
      });
    },
  };
}
