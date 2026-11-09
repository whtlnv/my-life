import { describe, expect, it } from 'vitest';

import { profileDirectoryWith, promptFile } from './app.test-support';
import { agentToolRoundLimitReply, createClaudeAgent } from './claude-agent';

interface SentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: unknown }[];
}

// The model, prompt and profile of every test that asserts nothing about them.
function fixedAgentSetup() {
  return {
    model: 'claude-opus-5-5',
    promptPath: promptFile('You are the operator of Ana’s working life.', 'agent-v1.md'),
    profileDirectory: profileDirectoryWith({ 'accounts.md': 'Ana has one account.' }),
  };
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

  it("sends a requested tool's result back to the model and returns the model's following text as the reply", async () => {
    const sentRequests: SentRequest[] = [];
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'tasks', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'You have one open task: send the budget.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      tools: [
        {
          name: 'tasks',
          description: 'The open tasks.',
          inputSchema: { type: 'object', properties: {} },
          run: () => Promise.resolve({ tasks: [{ title: 'Send the budget' }] }),
        },
      ],
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return Promise.resolve(responses.shift() ?? responses[0]);
      },
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'What is on my plate today?' }] });

    expect(reply.text).toBe('You have one open task: send the budget.');
    expect(sentRequests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-use-1',
          content: JSON.stringify({ tasks: [{ title: 'Send the budget' }] }),
        },
      ],
    });
  });

  it('sends an error result back to the model when it asks for a tool that does not exist, and still returns its following text', async () => {
    const sentRequests: SentRequest[] = [];
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'weather', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'I cannot check the weather.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      tools: [],
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return Promise.resolve(responses.shift() ?? responses[0]);
      },
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'Will it rain?' }] });

    expect(reply.text).toBe('I cannot check the weather.');
    expect(sentRequests[1]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-use-1', is_error: true }],
    });
  });
  it("sends a validation error back to the model and does not run the tool when the tool's input fails its schema", async () => {
    const sentRequests: SentRequest[] = [];
    const toolInputsRun: unknown[] = [];
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'search_messages', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'I need a query to search.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      tools: [
        {
          name: 'search_messages',
          description: 'Search the stored messages.',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          run: (input: unknown) => {
            toolInputsRun.push(input);
            return Promise.resolve({ messages: [] });
          },
        },
      ],
      createMessage: (request: SentRequest) => {
        sentRequests.push(request);
        return Promise.resolve(responses.shift() ?? responses[0]);
      },
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'Find the budget email.' }] });

    expect(reply.text).toBe('I need a query to search.');
    expect(toolInputsRun).toEqual([]);
    expect(sentRequests[1]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-use-1',
          is_error: true,
          content: expect.stringContaining('query') as unknown,
        },
      ],
    });
  });
  it('stops the turn and replies that it stopped when the model keeps asking for tools past the configured round limit', async () => {
    const toolRuns: unknown[] = [];
    let modelCalls = 0;
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      maxToolRounds: 2,
      tools: [
        {
          name: 'tasks',
          description: 'The open tasks.',
          inputSchema: { type: 'object', properties: {} },
          run: (input: unknown) => {
            toolRuns.push(input);
            return Promise.resolve({ tasks: [] });
          },
        },
      ],
      createMessage: () => {
        modelCalls += 1;
        if (modelCalls > 5) {
          return Promise.resolve({
            content: [{ type: 'text', text: 'Finally done.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 0, output_tokens: 0 },
          });
        }
        return Promise.resolve({
          content: [{ type: 'tool_use', id: `tool-use-${String(modelCalls)}`, name: 'tasks', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      },
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'What is on my plate today?' }] });

    expect(toolRuns).toHaveLength(2);
    expect(reply.text).toBe(agentToolRoundLimitReply);
  });
  it('reports the cost of every model call in the turn, tool rounds included, from the response usage and the configured pricing', async () => {
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'tasks', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1_000_000, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'You have no open tasks.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 1_000_000 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      tools: [
        {
          name: 'tasks',
          description: 'The open tasks.',
          inputSchema: { type: 'object', properties: {} },
          run: () => Promise.resolve({ tasks: [] }),
        },
      ],
      createMessage: () => Promise.resolve(responses.shift() ?? responses[0]),
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'What is on my plate today?' }] });

    expect(reply.costInUsd).toBe(30);
  });
  it('reports the cost of every model call made before the turn stopped at the tool-round limit', async () => {
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      maxToolRounds: 1,
      tools: [
        {
          name: 'tasks',
          description: 'The open tasks.',
          inputSchema: { type: 'object', properties: {} },
          run: () => Promise.resolve({ tasks: [] }),
        },
      ],
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'tasks', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 1_000_000, output_tokens: 0 },
        }),
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'What is on my plate today?' }] });

    expect(reply.text).toBe(agentToolRoundLimitReply);
    expect(reply.costInUsd).toBe(10);
  });
  it("sends Claude the name, description and input schema of each tool passed in the turn, and answers Claude's tool_use with that turn's tool", async () => {
    const sentRequests: (SentRequest & { tools?: unknown })[] = [];
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'tasks', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'You have one open task: send the budget.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: (request: SentRequest & { tools?: unknown }) => {
        sentRequests.push(request);
        return Promise.resolve(responses.shift() ?? responses[0]);
      },
    });

    await agent.respond({
      turns: [{ role: 'user', text: 'What is on my plate today?' }],
      tools: [
        {
          name: 'tasks',
          description: 'The open tasks.',
          inputSchema: { type: 'object', properties: {} },
          run: () => Promise.resolve({ tasks: [{ title: 'Send the budget' }] }),
        },
      ],
    });

    expect(sentRequests[0]?.tools).toContainEqual({
      name: 'tasks',
      description: 'The open tasks.',
      input_schema: { type: 'object', properties: {} },
    });
    expect(sentRequests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-use-1',
          content: JSON.stringify({ tasks: [{ title: 'Send the budget' }] }),
        },
      ],
    });
  });

  it('returns the ids Claude passes to the cite_sources tool as the citations of its reply', async () => {
    const responses = [
      {
        content: [
          { type: 'tool_use', id: 'tool-use-1', name: 'cite_sources', input: { ids: ['message-1', 'event-2'] } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'Luis sent the quarterly numbers before the review.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () => Promise.resolve(responses.shift() ?? responses[0]),
    });

    const reply = await agent.respond({ turns: [{ role: 'user', text: 'Did Luis send the numbers?' }] });

    expect(reply.citations).toEqual([{ id: 'message-1' }, { id: 'event-2' }]);
  });
  it('offers Claude a cite_sources tool that takes the cited ids, and answers its call without an error', async () => {
    const requests: { tools?: { name: string; description: string; input_schema: unknown }[]; messages: unknown[] }[] =
      [];
    const responses = [
      {
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'cite_sources', input: { ids: ['message-1'] } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      {
        content: [{ type: 'text', text: 'Luis sent the quarterly numbers.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ];
    const agent = createClaudeAgent({
      ...fixedAgentSetup(),
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: (request) => {
        requests.push(structuredClone(request));
        return Promise.resolve(responses.shift() ?? responses[0]);
      },
    });

    await agent.respond({ turns: [{ role: 'user', text: 'Did Luis send the numbers?' }], tools: [] });

    const citeSources = requests[0]?.tools?.find(({ name }) => name === 'cite_sources');
    expect(citeSources?.description).toMatch(/\S/);
    expect(citeSources?.input_schema).toMatchObject({ required: ['ids'] });
    expect(JSON.stringify(requests[1]?.messages.at(-1))).not.toContain('is_error');
  });
});
