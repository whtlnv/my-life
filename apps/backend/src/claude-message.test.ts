import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';

import { createMessageWith } from './claude-message';

interface RecordedBody {
  messages: unknown[];
}

async function startFakeAnthropic(recorded: RecordedBody[], answer: unknown): Promise<Server> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      recorded.push(JSON.parse(body) as RecordedBody);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

describe('the production Claude request', () => {
  let fakeAnthropic: Server | undefined;

  afterEach(() => {
    fakeAnthropic?.close();
  });

  it("keeps each message's role and its tool_use and tool_result blocks, and returns Claude's tool_use blocks and stop reason", async () => {
    const recorded: RecordedBody[] = [];
    fakeAnthropic = await startFakeAnthropic(recorded, {
      id: 'message-from-fake',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'tool_use', id: 'tool-use-2', name: 'read_thread', input: { messageId: 'message-budget' } }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const port = (fakeAnthropic.address() as AddressInfo).port;
    const createMessage = createMessageWith(
      new Anthropic({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${String(port)}` }),
    );
    const roundTrip = [
      { role: 'user', content: 'Find the budget email.' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'search_messages', input: { query: 'budget' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-use-1', content: '{"messages":[]}' }],
      },
    ];

    const response = await createMessage({
      model: 'claude-opus-5-5',
      system: 'You are the operator of Ana’s working life.',
      messages: roundTrip,
      tools: [{ name: 'read_thread', strict: true, input_schema: { type: 'object', properties: {} } }],
    });

    expect(recorded[0]?.messages).toEqual(roundTrip);
    expect(response).toMatchObject({
      content: [{ type: 'tool_use', id: 'tool-use-2', name: 'read_thread', input: { messageId: 'message-budget' } }],
      stop_reason: 'tool_use',
    });
  });
});
