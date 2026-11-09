import { filterProposal } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { promptFile } from './app.test-support';
import { createClaudeFilter } from './claude-filter';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
  system?: string;
  tools?: { name: string; strict?: boolean; input_schema: unknown }[];
  messages?: { role: string; content: string }[];
}

function recordingCreateMessage(sentRequests: SentRequest[], answeredProposal: unknown) {
  return (request: SentRequest) => {
    sentRequests.push(request);
    return Promise.resolve({
      content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_filter', input: answeredProposal }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  };
}

describe('Claude filter', () => {
  it('asks the configured model through a strict propose_filter tool with the versioned prompt and returns the validated proposal', async () => {
    const settings = readStartupSettings({ MY_LIFE_TRIAGE_MODEL: 'claude-model-from-settings' }, '/Users/ana');
    const answeredProposal = {
      criteria: { from: 'news@supplier.com' },
      labelName: 'Supplier newsletters',
      skipInbox: true,
    };
    const sentRequests: SentRequest[] = [];
    const filter = createClaudeFilter({
      model: settings.triageModel,
      promptPath: promptFile('Propose a Gmail filter by calling propose_filter.', 'filter-v3.md'),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: recordingCreateMessage(sentRequests, answeredProposal),
    });

    const result = await filter.propose({
      accountEmail: 'ana@acme.com',
      criteria: { from: 'news@supplier.com' },
      messageIds: ['message-1', 'message-2', 'message-3'],
    });

    expect(
      sentRequests.map(({ model, system, tools }) => ({
        model,
        system,
        tools: tools?.map(({ name, strict, input_schema }) => ({ name, strict, input_schema })),
      })),
    ).toEqual([
      {
        model: 'claude-model-from-settings',
        system: 'Propose a Gmail filter by calling propose_filter.',
        tools: [{ name: 'propose_filter', strict: true, input_schema: filterProposal.toJSONSchema() }],
      },
    ]);
    expect(result).toMatchObject({ proposal: answeredProposal, promptVersion: 'filter-v3' });
  });
  it("puts the candidate's account, criteria and each archived message's sender and subject in the user message", async () => {
    const sentRequests: SentRequest[] = [];
    const filter = createClaudeFilter({
      model: 'claude-model',
      promptPath: promptFile('Propose a Gmail filter.', 'filter-v1.md'),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: recordingCreateMessage(sentRequests, {
        criteria: { from: 'news@supplier.com' },
        labelName: 'Supplier',
        skipInbox: true,
      }),
    });

    await filter.propose({
      accountEmail: 'ana@acme.com',
      criteria: { from: 'news@supplier.com' },
      messageIds: ['message-1', 'message-2'],
      messages: [
        { from: 'Supplier News <news@supplier.com>', subject: 'November catalogue' },
        { from: 'Supplier News <news@supplier.com>', subject: 'Weekend discounts' },
      ],
    });

    const userMessages = sentRequests[0]?.messages?.filter((message) => message.role === 'user') ?? [];
    expect(userMessages).toHaveLength(1);
    const content = userMessages[0]?.content ?? '';
    expect(content).toContain('ana@acme.com');
    expect(content).toContain('news@supplier.com');
    expect(content).toContain('Supplier News <news@supplier.com>');
    expect(content).toContain('November catalogue');
    expect(content).toContain('Weekend discounts');
  });
  it('reports the cost of the call in USD from the input and output tokens the answer reports at their configured prices', async () => {
    const answeredProposal = { criteria: { from: 'news@supplier.com' }, labelName: 'Supplier', skipInbox: true };
    const filter = createClaudeFilter({
      model: 'claude-model',
      promptPath: promptFile('Propose a Gmail filter.', 'filter-v1.md'),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_filter', input: answeredProposal }],
          usage: { input_tokens: 2_000_000, output_tokens: 400_000 },
        }),
    });

    const result = await filter.propose({
      accountEmail: 'ana@acme.com',
      criteria: { from: 'news@supplier.com' },
      messageIds: ['message-1'],
    });

    expect(result).toMatchObject({ proposal: answeredProposal, costInUsd: 20 });
  });
});
