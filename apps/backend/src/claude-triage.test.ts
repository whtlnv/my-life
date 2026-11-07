import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { triageProposal } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { createClaudeTriage } from './claude-triage';
import { readStartupSettings } from './startup-settings';

const defaultPricing = { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 };

function promptFile(
  contents = 'Classify this email and answer by calling propose_triage.',
  fileName = 'triage-v1.md',
): string {
  const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), fileName);
  writeFileSync(promptPath, contents);
  return promptPath;
}

interface SentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: string }[];
}

function firstSentRequest(sentRequests: SentRequest[]): SentRequest {
  const [first] = sentRequests;
  if (first === undefined) throw new Error('no request was sent');
  return first;
}

function firstUserContent(sentRequests: SentRequest[]): unknown {
  const [firstMessage] = firstSentRequest(sentRequests).messages;
  return JSON.parse(firstMessage?.content ?? '{}') as unknown;
}

function recordRequests() {
  const sentRequests: SentRequest[] = [];
  const createMessage = (request: SentRequest) => {
    sentRequests.push(request);
    return Promise.resolve({ content: [], usage: { input_tokens: 0, output_tokens: 0 } });
  };
  return { sentRequests, createMessage };
}

describe('Claude triage', () => {
  it('sends a triage request with the model id from settings', async () => {
    const settings = readStartupSettings({ MY_LIFE_TRIAGE_MODEL: 'claude-model-from-settings' }, '/Users/ana');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: settings.triageModel,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect(sentRequests.map((request) => request.model)).toEqual(['claude-model-from-settings']);
  });

  it("sends the prompt read from the versioned prompt file and reports that file's version", async () => {
    const promptPath = promptFile('Classify this email for Ana.', 'triage-v7.md');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      model: 'claude-opus-5-5',
      promptPath,
      createMessage,
    });

    const result = await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect({ system: firstSentRequest(sentRequests).system, promptVersion: result.promptVersion }).toEqual({
      system: 'Classify this email for Ana.',
      promptVersion: 'triage-v7',
    });
  });

  it("sends the account's profile text read from the profile directory", async () => {
    const promptPath = promptFile('Classify this email.');
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(join(profileDirectory, 'acme.md'), 'Ana runs the Acme sales team; invoices always matter.');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      model: 'claude-opus-5-5',
      promptPath,
      profileDirectory,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z', accountEmail: 'ana@acme.com' });

    expect(firstSentRequest(sentRequests).system).toContain('Ana runs the Acme sales team; invoices always matter.');
  });

  it("sends only the profile file named after the account's domain, not another account's", async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(join(profileDirectory, 'psmutuus.md'), 'Francisco runs operations at Psmutuus; claims always matter.');
    writeFileSync(join(profileDirectory, 'acme.md'), 'Ana runs the Acme sales team; invoices always matter.');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      model: 'claude-opus-5-5',
      promptPath: promptFile('Classify this email.'),
      profileDirectory,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z', accountEmail: 'franciscoc@psmutuus.com' });

    const { system } = firstSentRequest(sentRequests);
    expect({
      sendsOwnProfile: system?.includes('Francisco runs operations at Psmutuus; claims always matter.'),
      sendsOtherProfile: system?.includes('Ana runs the Acme sales team; invoices always matter.'),
    }).toEqual({ sendsOwnProfile: true, sendsOtherProfile: false });
  });

  it("sends the shared accounts profile alongside the account's own profile", async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(join(profileDirectory, 'accounts.md'), 'Ana has two accounts: Acme for sales, Gmail for family.');
    writeFileSync(join(profileDirectory, 'acme.md'), 'Ana runs the Acme sales team; invoices always matter.');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      model: 'claude-opus-5-5',
      promptPath: promptFile('Classify this email.'),
      profileDirectory,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z', accountEmail: 'ana@acme.com' });

    expect(firstSentRequest(sentRequests).system).toContain('Ana has two accounts: Acme for sales, Gmail for family.');
  });

  it("sends the message's headers, snippet and whether it is addressed to the user", async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      createMessage,
    });

    await triage.propose({
      id: 'message-1',
      threadId: 'thread-1',
      accountEmail: 'ana@acme.com',
      from: 'Bruno <bruno@supplier.com>',
      to: 'Ana <Ana@acme.com>',
      cc: 'carla@acme.com',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      snippet: 'Could you approve the attached quote by Friday?',
      listId: 'quotes.supplier.com',
    });

    expect(firstUserContent(sentRequests)).toEqual({
      from: 'Bruno <bruno@supplier.com>',
      to: 'Ana <Ana@acme.com>',
      cc: 'carla@acme.com',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      listId: 'quotes.supplier.com',
      snippet: 'Could you approve the attached quote by Friday?',
      addressedToUser: true,
    });
  });

  it('says a message is not addressed to the user when the account is only in Cc', async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      createMessage,
    });

    await triage.propose({
      id: 'message-2',
      accountEmail: 'ana@acme.com',
      from: 'Bruno <bruno@supplier.com>',
      to: 'Carla <carla@acme.com>',
      cc: 'Ana <ana@acme.com>',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      snippet: 'Carla, could you approve the attached quote by Friday?',
    });

    expect(firstUserContent(sentRequests)).toMatchObject({ addressedToUser: false });
  });

  it('sends the chosen verdict examples with the message', async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      createMessage,
    });
    const examples = [
      {
        messageId: 'message-0',
        from: 'Bruno <bruno@supplier.com>',
        category: 'expense',
        decision: 'confirmed',
        decidedAt: '2026-11-05T09:00:00-06:00',
      },
    ];

    await triage.propose(
      {
        id: 'message-3',
        accountEmail: 'ana@acme.com',
        from: 'Bruno <bruno@supplier.com>',
        date: '2026-11-07T10:00:00Z',
      },
      examples,
    );

    expect(firstUserContent(sentRequests)).toMatchObject({ examples });
  });

  it('turns a valid tool-use answer into a proposal', async () => {
    const answeredProposal = {
      action: 'act',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
      taskDraft: { title: 'Approve the November quote from Bruno' },
    };
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredProposal }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    });

    const result = await triage.propose({
      id: 'message-4',
      accountEmail: 'ana@acme.com',
      date: '2026-11-07T10:00:00Z',
    });

    expect(result).toMatchObject({ proposal: answeredProposal });
  });

  it('turns a tool-use answer that fails the shared contract into no proposal and records the failure', async () => {
    const answeredInput = {
      action: 'delete',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
    };
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredInput }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    });

    const result = await triage.propose({
      id: 'message-5',
      accountEmail: 'ana@acme.com',
      date: '2026-11-07T10:00:00Z',
    });

    expect(result).toMatchObject({ failure: { input: answeredInput } });
  });

  it('computes the cost of a call from the tokens the answer reports', async () => {
    const triage = createClaudeTriage({
      promptPath: promptFile(),
      model: 'claude-opus-5-5',
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () =>
        Promise.resolve({
          content: [],
          usage: { input_tokens: 1_000_000, output_tokens: 200_000 },
        }),
    });

    const result = await triage.propose({
      id: 'message-7',
      accountEmail: 'ana@acme.com',
      date: '2026-11-07T10:00:00Z',
    });

    expect(result).toMatchObject({ costInUsd: 10 });
  });

  it('reports the cost of a valid tool-use answer to a prompted request from its input and output tokens at their separate prices', async () => {
    const promptPath = promptFile('Classify this email and answer by calling propose_triage.');
    const answeredProposal = {
      action: 'act',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
      taskDraft: { title: 'Approve the November quote from Bruno' },
    };
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredProposal }],
          usage: { input_tokens: 3_000_000, output_tokens: 100_000 },
        }),
    });

    const result = await triage.propose({
      id: 'message-8',
      accountEmail: 'ana@acme.com',
      date: '2026-11-07T10:00:00Z',
    });

    expect(result).toMatchObject({ proposal: answeredProposal, costInUsd: 17.5 });
  });

  it('turns a tool-use answer to a prompted request that fails the shared contract into no proposal, records the failure and reports its cost', async () => {
    const promptPath = promptFile('Classify this email and answer by calling propose_triage.');
    const answeredInput = {
      action: 'delete',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
    };
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      pricing: { inputPerMillionTokensInUsd: 5, outputPerMillionTokensInUsd: 25 },
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredInput }],
          usage: { input_tokens: 1_000_000, output_tokens: 40_000 },
        }),
    });

    const result = await triage.propose({
      id: 'message-9',
      accountEmail: 'ana@acme.com',
      date: '2026-11-07T10:00:00Z',
    });

    expect(result.proposal).toBeUndefined();
    expect(result).toMatchObject({ failure: { input: answeredInput }, costInUsd: 6 });
  });

  it('declares exactly one strict propose_triage tool built from the shared contract, leaves tool choice on auto and keeps the call instruction in the prompt file', async () => {
    const promptPath = promptFile('Classify this email and answer by calling propose_triage.');
    const sentRequests: Record<string, unknown>[] = [];
    const triage = createClaudeTriage({
      pricing: defaultPricing,
      model: 'claude-opus-5-5',
      promptPath,
      createMessage: (request: Record<string, unknown>) => {
        sentRequests.push(request);
        return Promise.resolve({ content: [], usage: { input_tokens: 0, output_tokens: 0 } });
      },
    });

    await triage.propose({ id: 'message-6', accountEmail: 'ana@acme.com', date: '2026-11-07T10:00:00Z' });

    const request = sentRequests[0] as {
      system?: string;
      tools?: {
        name: string;
        strict?: boolean;
        input_schema: { type: string; properties: Record<string, { enum?: string[] }>; required: string[] };
      }[];
      tool_choice?: { type: string };
    };
    expect(request.system).toBe('Classify this email and answer by calling propose_triage.');
    expect(request.tools?.map((tool) => ({ name: tool.name, strict: tool.strict }))).toEqual([
      { name: 'propose_triage', strict: true },
    ]);
    expect(Object.keys(request.tools?.[0]?.input_schema.properties ?? {})).toEqual(Object.keys(triageProposal.shape));
    expect(request.tools?.[0]?.input_schema).toMatchObject({
      type: 'object',
      properties: {
        action: { enum: triageProposal.shape.action.options },
        category: { enum: triageProposal.shape.category.options },
      },
    });
    expect(request.tool_choice ?? { type: 'auto' }).toEqual({ type: 'auto' });
  });
});
