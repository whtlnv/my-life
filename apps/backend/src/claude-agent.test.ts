import { describe, expect, it } from 'vitest';

import { profileDirectoryWith, promptFile } from './app.test-support';
import { createClaudeAgent } from './claude-agent';

interface SentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: unknown }[];
}

describe('Claude agent', () => {
  it("sends the versioned agent prompt file and the user's profile text as the system prompt", async () => {
    const sentRequests: SentRequest[] = [];
    const agent = createClaudeAgent({
      model: 'claude-opus-5-5',
      promptPath: promptFile('You are the operator of Ana’s working life.', 'agent-v1.md'),
      profileDirectory: profileDirectoryWith({
        'accounts.md': 'Ana has two accounts: Acme for sales, Gmail for family.',
      }),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return Promise.resolve({
          content: [{ type: 'text', text: 'You have two open tasks today.' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      },
    });

    await agent.respond({ turns: [{ role: 'user', text: 'What is on my plate today?' }] });

    const system = sentRequests[0]?.system ?? '';
    expect(system).toContain('You are the operator of Ana’s working life.');
    expect(system).toContain('Ana has two accounts: Acme for sales, Gmail for family.');
  });
});
